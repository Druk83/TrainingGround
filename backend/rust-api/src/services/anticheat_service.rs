use anyhow::{Context, Result};
use chrono::Utc;
use mongodb::Database;
use redis::aio::ConnectionManager;
use uuid::Uuid;

use crate::models::anticheat::{
    ActionTaken, AnticheatStatus, IncidentDetails, IncidentRecord, IncidentSeverity, IncidentType,
};

use crate::utils::retry::{retry_async_with_config, RetryConfig};

const SPEED_THRESHOLD_SUSPICIOUS: u32 = 5; // >5 attempts per hour = suspicious
const SPEED_THRESHOLD_BLOCKED: u32 = 10; // >10 attempts per hour = blocked
const REPEATED_THRESHOLD_BLOCKED: u32 = 8; // >8 repeated answers = blocked
const TIME_WINDOW_SECONDS: u64 = 3600; // 1 hour

pub struct AnticheatService {
    mongo: Database,
    redis: ConnectionManager,
}

impl AnticheatService {
    pub fn new(mongo: Database, redis: ConnectionManager) -> Self {
        Self { mongo, redis }
    }

    /// Track answer submission and check for violations
    pub async fn track_answer(
        &self,
        user_id: &str,
        answer: &str,
        session_id: &str,
    ) -> Result<AnticheatStatus> {
        if Self::anticheat_disabled() {
            tracing::debug!(
                "Anticheat disabled (ANTICHEAT_DISABLED=1); skipping tracking for user={}",
                user_id
            );
            return Ok(AnticheatStatus {
                user_id: user_id.to_string(),
                is_suspicious: false,
                is_blocked: false,
                speed_hits: 0,
                repeated_hits: 0,
                last_check: Utc::now(),
            });
        }

        tracing::debug!(
            "Tracking answer for anticheat: user={}, session={}",
            user_id,
            session_id
        );

        // Increment counters atomically
        let (speed_hits, repeated_hits) = self.increment_counters(user_id, answer).await?;

        tracing::info!(
            "Anticheat counters: user={}, speed={}, repeated={}",
            user_id,
            speed_hits,
            repeated_hits
        );

        // Check thresholds
        let is_blocked =
            speed_hits > SPEED_THRESHOLD_BLOCKED || repeated_hits > REPEATED_THRESHOLD_BLOCKED;
        let is_suspicious = !is_blocked && speed_hits > SPEED_THRESHOLD_SUSPICIOUS;

        // Create incident if threshold exceeded
        if is_blocked {
            self.create_incident(
                user_id,
                speed_hits,
                repeated_hits,
                IncidentSeverity::Critical,
                ActionTaken::Blocked,
            )
            .await?;
        } else if is_suspicious {
            self.create_incident(
                user_id,
                speed_hits,
                repeated_hits,
                IncidentSeverity::Medium,
                ActionTaken::Flagged,
            )
            .await?;
        }

        Ok(AnticheatStatus {
            user_id: user_id.to_string(),
            is_suspicious,
            is_blocked,
            speed_hits,
            repeated_hits,
            last_check: Utc::now(),
        })
    }

    /// Helper to check whether anticheat is disabled via env var
    fn anticheat_disabled() -> bool {
        std::env::var("ANTICHEAT_DISABLED").unwrap_or_else(|_| "0".to_string()) == "1"
    }

    /// Helper to check whether anticheat writes should be async
    fn anticheat_write_async_enabled() -> bool {
        std::env::var("ANTICHEAT_WRITE_ASYNC").unwrap_or_else(|_| "1".to_string()) != "0"
    }

    /// Increment speed and repeated answer counters using Lua for atomicity
    async fn increment_counters(&self, user_id: &str, answer: &str) -> Result<(u32, u32)> {
        let mut conn = self.redis.clone();

        let speed_key = format!("anticheat:speed:{}", user_id);
        let repeated_key = format!(
            "anticheat:repeated:{}:{}",
            user_id,
            self.hash_answer(answer)
        );

        // Lua script for atomic increment with TTL
        let lua_script = r#"
            local speed_key = KEYS[1]
            local repeated_key = KEYS[2]
            local ttl = tonumber(ARGV[1])
            
            -- Increment speed counter
            local speed_hits = redis.call('INCR', speed_key)
            if speed_hits == 1 then
                redis.call('EXPIRE', speed_key, ttl)
            end
            
            -- Increment repeated answer counter
            local repeated_hits = redis.call('INCR', repeated_key)
            if repeated_hits == 1 then
                redis.call('EXPIRE', repeated_key, ttl)
            end
            
            return {speed_hits, repeated_hits}
        "#;

        let result: Vec<u32> = redis::Script::new(lua_script)
            .key(&speed_key)
            .key(&repeated_key)
            .arg(TIME_WINDOW_SECONDS)
            .invoke_async(&mut conn)
            .await
            .context("Failed to increment anticheat counters")?;

        Ok((result[0], result[1]))
    }

    /// Create incident record and publish to Redis Pub/Sub
    async fn create_incident(
        &self,
        user_id: &str,
        speed_hits: u32,
        repeated_hits: u32,
        severity: IncidentSeverity,
        action: ActionTaken,
    ) -> Result<()> {
        // Respect global disable flag for perf/debug runs
        if Self::anticheat_disabled() {
            tracing::warn!(
                "Anticheat incident creation skipped (ANTICHEAT_DISABLED=1): user={}",
                user_id
            );
            return Ok(());
        }

        let incident_type = if speed_hits > SPEED_THRESHOLD_BLOCKED {
            IncidentType::SpeedViolation
        } else if repeated_hits > REPEATED_THRESHOLD_BLOCKED {
            IncidentType::RepeatedAnswers
        } else {
            IncidentType::SuspiciousPattern
        };

        let incident = IncidentRecord {
            id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            incident_type,
            severity,
            details: IncidentDetails {
                speed_hits: Some(speed_hits),
                repeated_hits: Some(repeated_hits),
                time_window_seconds: Some(TIME_WINDOW_SECONDS as u32),
                additional_info: None,
            },
            timestamp: Utc::now(),
            action_taken: action,
        };

        tracing::warn!(
            "Creating anticheat incident: user={}, type={:?}, severity={:?}, action={:?}",
            user_id,
            incident.incident_type,
            incident.severity,
            incident.action_taken
        );

        // Publish to Redis Pub/Sub first (best-effort)
        if let Err(e) = self.publish_incident(&incident).await {
            tracing::warn!("Failed to publish incident to Redis Pub/Sub: {:#?}", e);
        }

        // Decide sync vs async save
        if Self::anticheat_write_async_enabled() {
            // Background save with aggressive retries; on permanent failure push to Redis queue
            let mongo = self.mongo.clone();
            let mut redis_conn = self.redis.clone();
            let incident_cloned = incident.clone();

            tokio::spawn(async move {
                let cfg = RetryConfig::aggressive();

                let res: Result<_, mongodb::error::Error> =
                    retry_async_with_config(cfg, || async {
                        let collection: mongodb::Collection<IncidentRecord> =
                            mongo.collection("incidents");
                        collection.insert_one(&incident_cloned).await.map(|_| ())
                    })
                    .await;

                if let Err(e) = res {
                    tracing::error!(
                        "Background incident save failed: {:#?}. Pushing to Redis queue.",
                        e
                    );
                    // Push serialized incident to Redis list as durable fallback
                    if let Ok(payload) = serde_json::to_string(&incident_cloned) {
                        let _: Result<(), _> = redis::cmd("RPUSH")
                            .arg("incidents:queue")
                            .arg(&payload)
                            .query_async(&mut redis_conn)
                            .await;
                    }
                } else {
                    tracing::info!("Background incident saved: id={}", incident_cloned.id);
                }
            });
        } else {
            // Synchronous save with aggressive retry to improve reliability
            let cfg = RetryConfig::aggressive();
            retry_async_with_config(cfg, || async { self.save_incident(&incident).await }).await?;
        }

        Ok(())
    }

    async fn save_incident(&self, incident: &IncidentRecord) -> Result<()> {
        let collection: mongodb::Collection<IncidentRecord> = self.mongo.collection("incidents");

        collection
            .insert_one(incident)
            .await
            .context("Failed to save incident to MongoDB")?;

        tracing::info!("Incident saved to MongoDB: id={}", incident.id);
        Ok(())
    }

    async fn publish_incident(&self, incident: &IncidentRecord) -> Result<()> {
        let mut conn = self.redis.clone();
        let channel = "incidents";

        let payload =
            serde_json::to_string(incident).context("Failed to serialize incident for pub/sub")?;

        let _: () = redis::cmd("PUBLISH")
            .arg(channel)
            .arg(&payload)
            .query_async(&mut conn)
            .await
            .context("Failed to publish incident to Redis Pub/Sub")?;

        tracing::info!(
            "Incident published to Redis Pub/Sub: channel={}, id={}",
            channel,
            incident.id
        );
        Ok(())
    }

    /// Get current anticheat status for user
    pub async fn get_status(&self, user_id: &str) -> Result<AnticheatStatus> {
        let mut conn = self.redis.clone();

        let speed_key = format!("anticheat:speed:{}", user_id);

        // Get speed hits count
        let speed_hits: Option<u32> = redis::cmd("GET")
            .arg(&speed_key)
            .query_async(&mut conn)
            .await
            .unwrap_or(None);

        let speed_hits = speed_hits.unwrap_or(0);

        // For repeated hits, we'd need to scan all keys (expensive)
        // For now, estimate based on speed hits
        let repeated_hits = 0; // Simplified

        let is_blocked = speed_hits > SPEED_THRESHOLD_BLOCKED;
        let is_suspicious = !is_blocked && speed_hits > SPEED_THRESHOLD_SUSPICIOUS;

        Ok(AnticheatStatus {
            user_id: user_id.to_string(),
            is_suspicious,
            is_blocked,
            speed_hits,
            repeated_hits,
            last_check: Utc::now(),
        })
    }

    /// Reset counters for user (admin action)
    pub async fn reset_counters(&self, user_id: &str) -> Result<()> {
        let mut conn = self.redis.clone();

        let speed_key = format!("anticheat:speed:{}", user_id);
        let pattern = format!("anticheat:repeated:{}:*", user_id);

        // Delete speed counter
        let _: () = redis::cmd("DEL")
            .arg(&speed_key)
            .query_async(&mut conn)
            .await
            .context("Failed to delete speed counter")?;

        // Note: Deleting all repeated keys would require SCAN
        // For now, they'll expire naturally after 1 hour
        tracing::info!(
            "Reset anticheat counters for user={}, pattern={}",
            user_id,
            pattern
        );

        Ok(())
    }

    /// Simple hash for answer deduplication
    fn hash_answer(&self, answer: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        answer.trim().to_lowercase().hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anticheat_disabled_default_false() {
        std::env::remove_var("ANTICHEAT_DISABLED");
        assert!(!AnticheatService::anticheat_disabled());
    }

    #[test]
    fn anticheat_disabled_can_be_enabled() {
        std::env::set_var("ANTICHEAT_DISABLED", "1");
        assert!(AnticheatService::anticheat_disabled());
        std::env::remove_var("ANTICHEAT_DISABLED");
    }

    #[test]
    fn anticheat_write_async_default_true() {
        std::env::remove_var("ANTICHEAT_WRITE_ASYNC");
        assert!(AnticheatService::anticheat_write_async_enabled());
    }

    #[test]
    fn anticheat_write_async_can_be_disabled() {
        std::env::set_var("ANTICHEAT_WRITE_ASYNC", "0");
        assert!(!AnticheatService::anticheat_write_async_enabled());
        std::env::remove_var("ANTICHEAT_WRITE_ASYNC");
    }
}
