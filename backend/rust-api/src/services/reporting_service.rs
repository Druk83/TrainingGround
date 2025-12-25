use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use futures::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId, to_bson, Bson, Document},
    Collection, Database,
};
use redis::aio::ConnectionManager;

use crate::utils::time::chrono_to_bson;

use crate::{
    middlewares::auth::JwtClaims,
    models::{
        reporting::{
            ExportStatus, LeaderboardDocument, LeaderboardEntry, LeaderboardScope,
            MaterializedStat, NewReportExport, ReportExport, StatType,
        },
        ProgressSummary,
    },
};

pub struct ReportingService {
    mongo: Database,
    redis: ConnectionManager,
}

impl ReportingService {
    pub fn new(mongo: Database, redis: ConnectionManager) -> Self {
        Self { mongo, redis }
    }

    pub fn mongo(&self) -> Database {
        self.mongo.clone()
    }

    pub fn redis(&self) -> ConnectionManager {
        self.redis.clone()
    }

    pub fn guard_group_access(&self, claims: &JwtClaims, group_id: &ObjectId) -> Result<()> {
        if claims.role == "admin" {
            return Ok(());
        }

        if claims.role != "teacher" {
            return Err(anyhow!("Forbidden"));
        }

        let allowed = claims
            .group_ids
            .iter()
            .any(|gid| gid == &group_id.to_string());
        if allowed {
            Ok(())
        } else {
            Err(anyhow!("Forbidden"))
        }
    }

    pub async fn load_group_snapshot(
        &self,
        group_id: &ObjectId,
    ) -> Result<Option<MaterializedStat>> {
        self.load_materialized_stat(StatType::Group, group_id).await
    }

    pub async fn load_topic_snapshot(
        &self,
        topic_id: &ObjectId,
    ) -> Result<Option<MaterializedStat>> {
        self.load_materialized_stat(StatType::Topic, topic_id).await
    }

    pub async fn load_user_progress(&self, user_id: &ObjectId) -> Result<Vec<ProgressSummary>> {
        let collection = self.mongo.collection::<ProgressSummary>("progress_summary");
        let cursor = collection
            .find(doc! { "user_id": user_id.to_string() })
            .await
            .context("Failed to query progress summary")?;

        cursor
            .try_collect()
            .await
            .map_err(|e| anyhow!("Progress summary query failed: {}", e))
    }

    pub async fn user_belongs_to_groups(
        &self,
        user_id: &ObjectId,
        group_ids: &[ObjectId],
    ) -> Result<bool> {
        if group_ids.is_empty() {
            return Ok(false);
        }

        let collection = self.mongo.collection::<Document>("groups");
        let filter = doc! {
            "_id": { "$in": group_ids },
            "student_ids": user_id
        };

        let count = collection
            .count_documents(filter)
            .await
            .context("Failed to verify user group membership")?;

        Ok(count > 0)
    }

    pub async fn load_leaderboard(
        &self,
        scope: LeaderboardScope,
        scope_id: Option<&ObjectId>,
    ) -> Result<Option<LeaderboardDocument>> {
        let collection = self.mongo.collection::<LeaderboardDocument>("leaderboards");
        let mut filter = doc! {
            "scope": scope.as_str()
        };
        match scope_id {
            Some(id) => {
                filter.insert("scope_id", id);
            }
            None => {
                filter.insert("scope_id", Bson::Null);
            }
        }

        let mut cursor = collection
            .find(filter)
            .sort(doc! { "generatedAt": -1 })
            .limit(1)
            .await
            .context("Failed to query leaderboard")?;

        match cursor
            .try_next()
            .await
            .map_err(|e| anyhow!("Leaderboard cursor failure: {}", e))?
        {
            Some(doc) => Ok(Some(doc)),
            None => Ok(None),
        }
    }

    async fn load_materialized_stat(
        &self,
        stat_type: StatType,
        entity_id: &ObjectId,
    ) -> Result<Option<MaterializedStat>> {
        let collection = self
            .mongo
            .collection::<MaterializedStat>("materialized_stats");

        let filter = doc! {
            "type": stat_type.as_str(),
            "entity_id": entity_id
        };

        let result = collection
            .find_one(filter)
            .await
            .context("Failed to query materialized stats")?;

        Ok(result)
    }

    pub async fn upsert_materialized_stat(
        &self,
        stat_type: StatType,
        entity_id: &ObjectId,
        metrics: Document,
    ) -> Result<()> {
        let collection = self.mongo.collection::<Document>("materialized_stats");

        let update_doc = doc! {
            "$set": {
                "metrics": metrics,
                "calculatedAt": chrono_to_bson(Utc::now())
            },
            "$setOnInsert": {
                "type": stat_type.as_str(),
                "entity_id": entity_id
            }
        };

        collection
            .update_one(
                doc! {
                    "type": stat_type.as_str(),
                    "entity_id": entity_id
                },
                update_doc,
            )
            .upsert(true)
            .await
            .context("Failed to update materialized stat")?;

        Ok(())
    }

    pub async fn upsert_leaderboard(
        &self,
        scope: LeaderboardScope,
        scope_id: Option<&ObjectId>,
        rankings: Vec<LeaderboardEntry>,
    ) -> Result<()> {
        let collection = self.mongo.collection::<Document>("leaderboards");
        let mut filter = doc! {
            "scope": scope.as_str()
        };
        if let Some(id) = scope_id {
            filter.insert("scope_id", id);
        } else {
            filter.insert("scope_id", Bson::Null);
        }
        let scope_value = scope_id.map(|id| Bson::ObjectId(*id)).unwrap_or(Bson::Null);

        let update_doc = doc! {
            "$set": {
                "scope": scope.as_str(),
                "scope_id": scope_value,
                "rankings": to_bson(&rankings)?,
                "generatedAt": chrono_to_bson(Utc::now())
            }
        };

        collection
            .update_one(filter, update_doc)
            .upsert(true)
            .await
            .context("Failed to persist leaderboard")?;

        Ok(())
    }

    pub async fn create_export_request(&self, payload: NewReportExport) -> Result<ReportExport> {
        let record = payload.into_record();
        let collection = self.mongo.collection::<ReportExport>("report_exports");
        collection
            .insert_one(&record)
            .await
            .context("Failed to insert export request")?;
        Ok(record)
    }

    pub async fn fetch_pending_exports(&self, limit: i64) -> Result<Vec<ReportExport>> {
        let collection = self.mongo.collection::<ReportExport>("report_exports");

        let mut cursor = collection
            .find(doc! { "status": to_bson(&ExportStatus::Pending)? })
            .sort(doc! { "createdAt": 1 })
            .limit(limit)
            .await
            .context("Failed to fetch pending exports")?;

        let mut exports = Vec::new();
        while let Some(export) = cursor
            .try_next()
            .await
            .map_err(|e| anyhow!("Pending exports cursor failure: {}", e))?
        {
            exports.push(export);
        }

        Ok(exports)
    }

    pub async fn get_export_by_id(&self, export_id: &ObjectId) -> Result<Option<ReportExport>> {
        let collection = self.mongo.collection::<ReportExport>("report_exports");
        let result = collection
            .find_one(doc! { "_id": export_id })
            .await
            .context("Failed to load export record")?;
        Ok(result)
    }

    pub async fn update_export_status(
        &self,
        export_id: &ObjectId,
        status: ExportStatus,
        storage_key: Option<&str>,
        error: Option<&str>,
    ) -> Result<()> {
        let collection: Collection<ReportExport> = self.mongo.collection("report_exports");

        let mut set_doc = doc! {
            "status": to_bson(&status)?,
        };

        if let Some(key) = storage_key {
            set_doc.insert("storage_key", key);
        }
        if let Some(message) = error {
            set_doc.insert("error", message);
        }

        if status.is_terminal() {
            set_doc.insert("completedAt", chrono_to_bson(Utc::now()));
        }

        collection
            .update_one(doc! { "_id": export_id }, doc! { "$set": set_doc })
            .await
            .context("Failed to update export status")?;

        Ok(())
    }

    pub async fn count_exports_in_window(
        &self,
        teacher_id: &ObjectId,
        window: Duration,
    ) -> Result<u64> {
        let chrono_window =
            ChronoDuration::from_std(window).map_err(|_| anyhow!("Invalid rate limit window"))?;
        let since_bson = chrono_to_bson(Utc::now() - chrono_window);

        let collection = self.mongo.collection::<ReportExport>("report_exports");
        let filter = doc! {
            "teacher_id": teacher_id,
            "createdAt": { "$gte": since_bson }
        };

        let count = collection
            .count_documents(filter)
            .await
            .context("Failed to count exports")?;

        Ok(count)
    }

    pub async fn reset_expired_exports(&self) -> Result<u64> {
        let collection = self.mongo.collection::<ReportExport>("report_exports");
        let now = Utc::now();
        let now_bson = chrono_to_bson(now);
        let active_statuses = vec![
            to_bson(&ExportStatus::Pending)?,
            to_bson(&ExportStatus::Processing)?,
        ];
        let result = collection
            .update_many(
                doc! {
                    "expiresAt": { "$lt": now_bson },
                    "status": { "$in": active_statuses }
                },
                doc! { "$set": { "status": to_bson(&ExportStatus::Failed)?, "error": "Expired by retention policy", "completedAt": now_bson } },
            )
            .await
            .context("Failed to update expired exports")?;
        Ok(result.modified_count)
    }
}
