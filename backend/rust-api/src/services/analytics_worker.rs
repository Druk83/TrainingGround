use std::{collections::HashMap, time::Duration};

use anyhow::{Context, Result};
use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use tokio::time::sleep;
use tracing::{info, warn};

use crate::{
    config::Config,
    metrics::ANALYTICS_WORKER_TICKS_TOTAL,
    models::reporting::{LeaderboardEntry, LeaderboardScope, StatType},
    services::reporting_service::ReportingService,
};

/// Sanitize user names to prevent CSV injection and limit special characters
/// - Filters out dangerous characters
/// - Limits length to 100 characters
/// - Allows only alphanumeric, whitespace, and safe punctuation (-, _, .)
fn sanitize_user_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || "-_.".contains(*c))
        .take(100)
        .collect()
}

pub struct AnalyticsWorker {
    reporting_service: ReportingService,
    config: Config,
}

impl AnalyticsWorker {
    pub fn new(reporting_service: ReportingService, config: Config) -> Self {
        Self {
            reporting_service,
            config,
        }
    }

    pub async fn run(&self) -> Result<()> {
        let interval = Duration::from_secs(self.config.reporting.worker_interval_secs);
        info!(
            "Starting analytics worker loop (interval {}s)",
            interval.as_secs()
        );

        loop {
            match self.run_once().await {
                Ok(()) => {
                    ANALYTICS_WORKER_TICKS_TOTAL
                        .with_label_values(&["success"])
                        .inc();
                    info!("Analytics worker tick completed");
                }
                Err(err) => {
                    ANALYTICS_WORKER_TICKS_TOTAL
                        .with_label_values(&["error"])
                        .inc();
                    warn!(error = %err, "Analytics worker tick failed");
                }
            }

            sleep(interval).await;
        }
    }

    async fn run_once(&self) -> Result<()> {
        let groups = self.refresh_materialized_stats().await?;
        self.refresh_leaderboards(&groups).await?;
        Ok(())
    }

    async fn refresh_materialized_stats(&self) -> Result<Vec<(ObjectId, Vec<ObjectId>)>> {
        let mut groups_cursor = self
            .reporting_service
            .mongo()
            .collection::<Document>("groups")
            .find(Document::new())
            .await
            .context("Failed to query groups for analytics worker")?;

        let mut group_users = Vec::new();

        while let Some(group_doc) = groups_cursor.try_next().await? {
            let group_id = group_doc
                .get_object_id("_id")
                .context("Group document missing _id")?;

            let student_ids = group_doc
                .get_array("student_ids")
                .map(|array| {
                    array
                        .iter()
                        .filter_map(|value| value.as_object_id())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if student_ids.is_empty() {
                continue;
            }

            let filter = doc! { "user_id": { "$in": Bson::Array(student_ids.iter().cloned().map(Bson::ObjectId).collect()) } };
            let metrics = self.aggregate_progress_metrics(filter).await?;
            self.reporting_service
                .upsert_materialized_stat(StatType::Group, &group_id, metrics)
                .await?;

            group_users.push((group_id, student_ids));
        }

        let mut level_cursor = self
            .reporting_service
            .mongo()
            .collection::<Document>("levels")
            .find(Document::new())
            .await
            .context("Failed to query levels for analytics worker")?;

        let mut levels_by_topic: HashMap<ObjectId, Vec<ObjectId>> = HashMap::new();

        while let Some(level_doc) = level_cursor.try_next().await? {
            let level_id = level_doc
                .get_object_id("_id")
                .context("Level document missing _id")?;

            if let Ok(topic_id) = level_doc.get_object_id("topic_id") {
                levels_by_topic.entry(topic_id).or_default().push(level_id);

                let level_metrics = self
                    .aggregate_progress_metrics(doc! { "level_id": level_id })
                    .await?;
                self.reporting_service
                    .upsert_materialized_stat(StatType::Level, &level_id, level_metrics)
                    .await?;
            }
        }

        for (topic_id, level_ids) in levels_by_topic {
            if level_ids.is_empty() {
                continue;
            }
            let filter = doc! { "level_id": { "$in": level_ids.into_iter().map(Bson::ObjectId).collect::<Vec<_>>() } };
            let metrics = self.aggregate_progress_metrics(filter).await?;
            self.reporting_service
                .upsert_materialized_stat(StatType::Topic, &topic_id, metrics)
                .await?;
        }

        Ok(group_users)
    }

    async fn refresh_leaderboards(&self, groups: &[(ObjectId, Vec<ObjectId>)]) -> Result<()> {
        let global_entries = self.compute_leaderboard(None).await?;
        self.reporting_service
            .upsert_leaderboard(LeaderboardScope::Global, None, global_entries)
            .await?;

        for (group_id, student_ids) in groups {
            if student_ids.is_empty() {
                continue;
            }
            let filter = doc! { "user_id": { "$in": student_ids.iter().cloned().map(Bson::ObjectId).collect::<Vec<_>>() } };
            let entries = self.compute_leaderboard(Some(filter)).await?;
            self.reporting_service
                .upsert_leaderboard(LeaderboardScope::Group, Some(group_id), entries)
                .await?;
        }

        Ok(())
    }

    async fn compute_leaderboard(&self, filter: Option<Document>) -> Result<Vec<LeaderboardEntry>> {
        let collection = self
            .reporting_service
            .mongo()
            .collection::<Document>("progress_summary");

        let mut pipeline = Vec::new();
        if let Some(ref filter_doc) = filter {
            if !filter_doc.is_empty() {
                pipeline.push(doc! { "$match": filter_doc.clone() });
            }
        }

        pipeline.extend([
            doc! {
                "$group": {
                    "_id": "$user_id",
                    "score": { "$sum": "$score" }
                }
            },
            doc! { "$sort": { "score": -1 } },
            doc! { "$limit": 10 },
        ]);

        let mut cursor = collection.aggregate(pipeline).await?;
        let mut leaderboard = Vec::new();
        let mut user_ids = Vec::new();

        while let Some(doc) = cursor.try_next().await? {
            if let Ok(user_id) = doc.get_object_id("_id") {
                let score = doc
                    .get_i64("score")
                    .or_else(|_| doc.get_i32("score").map(|v| v as i64))
                    .unwrap_or(0);
                user_ids.push(user_id);
                leaderboard.push((user_id, score));
            }
        }

        let names = self.load_user_names(&user_ids).await?;

        Ok(leaderboard
            .into_iter()
            .enumerate()
            .map(|(idx, (user_id, score))| LeaderboardEntry {
                user_id,
                score,
                rank: (idx + 1) as u32,
                name: names
                    .get(&user_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown".to_string()),
            })
            .collect())
    }

    async fn load_user_names(&self, user_ids: &[ObjectId]) -> Result<HashMap<ObjectId, String>> {
        if user_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let collection = self
            .reporting_service
            .mongo()
            .collection::<Document>("users");
        let cursor = collection
            .find(doc! { "_id": { "$in": user_ids.iter().cloned().map(Bson::ObjectId).collect::<Vec<_>>() } })
            .await
            .context("Failed to query users for leaderboard")?;

        let mut names = HashMap::new();
        let mut user_iter = cursor;
        while let Some(user_doc) = user_iter.try_next().await? {
            if let Ok(user_id) = user_doc.get_object_id("_id") {
                if let Ok(name) = user_doc.get_str("name") {
                    // Apply sanitization to user names for security and data quality
                    names.insert(user_id, sanitize_user_name(name));
                }
            }
        }

        Ok(names)
    }

    async fn aggregate_progress_metrics(&self, filter: Document) -> Result<Document> {
        let collection = self
            .reporting_service
            .mongo()
            .collection::<Document>("progress_summary");

        let mut pipeline = Vec::new();
        if !filter.is_empty() {
            pipeline.push(doc! { "$match": filter });
        }

        pipeline.extend([
            doc! {
                "$group": {
                    "_id": Bson::Null,
                    "avg_accuracy": { "$avg": "$percentage" },
                    "avg_score": { "$avg": "$score" },
                    "total_attempts": { "$sum": "$attempts_total" },
                    "total_users": { "$sum": 1 }
                }
            },
            doc! {
                "$project": {
                    "_id": 0,
                    "avg_accuracy": 1,
                    "avg_score": 1,
                    "total_attempts": 1,
                    "total_users": 1
                }
            },
        ]);

        let mut cursor = collection.aggregate(pipeline).await?;
        if let Some(doc) = cursor.try_next().await? {
            Ok(doc)
        } else {
            Ok(Document::new())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_user_name_normal() {
        assert_eq!(sanitize_user_name("John Doe"), "John Doe");
        assert_eq!(sanitize_user_name("Anna-Maria"), "Anna-Maria");
        assert_eq!(sanitize_user_name("user_123"), "user_123");
    }

    #[test]
    fn test_sanitize_user_name_special_chars() {
        // CSV injection attempts should be stripped
        assert_eq!(sanitize_user_name("=1+1"), "11");
        assert_eq!(sanitize_user_name("+cmd"), "cmd");
        assert_eq!(sanitize_user_name("@SUM(A1)"), "SUMA1");
        assert_eq!(sanitize_user_name("-2+3"), "-23");
    }

    #[test]
    fn test_sanitize_user_name_dangerous_chars() {
        // Dangerous characters should be filtered out
        assert_eq!(
            sanitize_user_name("test<script>alert()</script>"),
            "testscriptalertscript"
        );
        assert_eq!(sanitize_user_name("user@email.com"), "useremail.com");
        assert_eq!(sanitize_user_name("name,with,commas"), "namewithcommas");
        assert_eq!(sanitize_user_name("quote\"test"), "quotetest");
    }

    #[test]
    fn test_sanitize_user_name_length_limit() {
        let long_name = "a".repeat(150);
        let sanitized = sanitize_user_name(&long_name);
        assert_eq!(sanitized.len(), 100);
        assert_eq!(sanitized, "a".repeat(100));
    }

    #[test]
    fn test_sanitize_user_name_unicode() {
        // Cyrillic and other Unicode characters should be preserved
        assert_eq!(sanitize_user_name("Иван Петров"), "Иван Петров");
        assert_eq!(sanitize_user_name("李明"), "李明");
        assert_eq!(sanitize_user_name("José García"), "José García");
    }

    #[test]
    fn test_sanitize_user_name_mixed() {
        assert_eq!(
            sanitize_user_name("User_123-Test.Name"),
            "User_123-Test.Name"
        );
        assert_eq!(sanitize_user_name("=evil+user@123"), "eviluser123");
    }
}
