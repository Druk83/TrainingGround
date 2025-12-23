use crate::metrics::{record_cache_hit, record_cache_miss, ANSWERS_SUBMITTED_TOTAL};
use crate::models::answer::{
    AttemptFailureReason, AttemptRecord, SubmitAnswerRequest, SubmitAnswerResponse,
};
use crate::models::{ProgressSummary, Session, Task};
use anyhow::{Context, Result};
use chrono::Utc;
use mongodb::Database;
use redis::aio::ConnectionManager;
use uuid::Uuid;

use super::anticheat_service::AnticheatService;
use crate::utils::retry::{retry_async_with_config, RetryConfig};

pub struct AnswerService {
    mongo: Database,
    redis: ConnectionManager,
}

impl AnswerService {
    pub fn new(mongo: Database, redis: ConnectionManager) -> Self {
        Self { mongo, redis }
    }

    pub async fn submit_answer(
        &self,
        session_id: &str,
        user_id: &str,
        task_id: &str,
        req: &SubmitAnswerRequest,
    ) -> Result<SubmitAnswerResponse> {
        tracing::info!(
            "Processing answer submission: session={}, user={}, task={}, answer={}",
            session_id,
            user_id,
            task_id,
            req.answer
        );

        let retry_cfg = RetryConfig::default();
        let aggressive_cfg = RetryConfig::aggressive();

        // Check idempotency - return cached result if exists
        let idempotency_key = req
            .idempotency_key
            .clone()
            .unwrap_or_else(|| format!("{}:{}", session_id, task_id));

        if let Some(cached_response) = retry_async_with_config(retry_cfg.clone(), || async {
            self.check_idempotency(&idempotency_key).await
        })
        .await?
        {
            record_cache_hit();
            tracing::info!(
                "Returning cached response for idempotency_key={}",
                idempotency_key
            );
            return Ok(cached_response);
        }
        record_cache_miss();

        // Check session timeout
        let session = retry_async_with_config(retry_cfg.clone(), || async {
            self.get_session(session_id).await
        })
        .await?;
        if session.expires_at < Utc::now() {
            tracing::warn!("Session {} expired, recording timeout", session_id);
            let attempt = AttemptRecord {
                id: Uuid::new_v4().to_string(),
                session_id: session_id.to_string(),
                user_id: user_id.to_string(),
                task_id: task_id.to_string(),
                answer: req.answer.clone(),
                correct: false,
                score: 0,
                timestamp: Utc::now(),
                reason: Some(AttemptFailureReason::Timeout),
            };
            // save attempt (may be background)
            self.save_attempt(&attempt).await?;

            anyhow::bail!("Session has expired");
        }

        // Anticheat check
        let anticheat = AnticheatService::new(self.mongo.clone(), self.redis.clone());
        let status = anticheat
            .track_answer(user_id, &req.answer, session_id)
            .await?;

        if status.is_blocked {
            anyhow::bail!("User is blocked due to suspicious activity");
        }

        // Get correct answer from MongoDB tasks collection
        let correct_answer = retry_async_with_config(aggressive_cfg.clone(), || async {
            self.get_correct_answer(task_id).await
        })
        .await?;
        let is_correct = req.answer.trim() == correct_answer.trim();

        // Record answer submission metric
        let correct_label = if is_correct { "true" } else { "false" };
        ANSWERS_SUBMITTED_TOTAL
            .with_label_values(&[correct_label])
            .inc();

        // Calculate score based on rules S1-S5
        let (score_awarded, combo_bonus, current_streak) = if is_correct {
            retry_async_with_config(retry_cfg.clone(), || async {
                self.process_correct_answer(user_id).await
            })
            .await?
        } else {
            retry_async_with_config(retry_cfg.clone(), || async {
                self.process_incorrect_answer(user_id).await
            })
            .await?
        };

        // Save attempt to MongoDB (may be background)
        let attempt = AttemptRecord {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            user_id: user_id.to_string(),
            task_id: task_id.to_string(),
            answer: req.answer.clone(),
            correct: is_correct,
            score: score_awarded + combo_bonus,
            timestamp: Utc::now(),
            reason: if !is_correct {
                Some(AttemptFailureReason::WrongAnswer)
            } else {
                None
            },
        };

        // Save attempt: prefer background async save; if configured to save synchronously, use aggressive retries
        let save_async =
            std::env::var("ANSWERS_SAVE_ASYNC").unwrap_or_else(|_| "1".to_string()) != "0";
        if save_async {
            self.save_attempt(&attempt).await?;
        } else {
            // synchronous path with aggressive retry
            retry_async_with_config(aggressive_cfg.clone(), || async {
                self.save_attempt(&attempt).await
            })
            .await?;
        }

        // Update total score in Redis
        let total_score = retry_async_with_config(aggressive_cfg.clone(), || async {
            self.update_total_score(user_id, score_awarded + combo_bonus)
                .await
        })
        .await?;

        // Update progress summary for S5 rule (80% threshold)
        retry_async_with_config(aggressive_cfg.clone(), || async {
            self.update_progress_summary(user_id, task_id, is_correct)
                .await
        })
        .await?;

        tracing::info!(
            "Answer processed: session={}, correct={}, score={}, streak={}",
            session_id,
            is_correct,
            score_awarded + combo_bonus,
            current_streak
        );

        let response = SubmitAnswerResponse {
            correct: is_correct,
            score_awarded,
            combo_bonus,
            total_score,
            current_streak,
            feedback: if is_correct {
                Some("Correct!".to_string())
            } else {
                Some("Incorrect answer".to_string())
            },
        };

        // Cache response for idempotency
        retry_async_with_config(aggressive_cfg.clone(), || async {
            self.cache_response(&idempotency_key, &response).await
        })
        .await?;

        Ok(response)
    }

    // Rule S1: +10 points for correct answer
    // Rule S4: +5 combo bonus after streak >= 3
    async fn process_correct_answer(&self, user_id: &str) -> Result<(i32, i32, u32)> {
        let mut conn = self.redis.clone();
        let streak_key = format!("score:series:{}", user_id);

        // Increment streak
        let streak: u32 = redis::cmd("INCR")
            .arg(&streak_key)
            .query_async(&mut conn)
            .await
            .context("Failed to increment streak")?;

        // Set TTL for streak (reset after 1 hour of inactivity)
        redis::cmd("EXPIRE")
            .arg(&streak_key)
            .arg(3600)
            .query_async::<()>(&mut conn)
            .await?;

        let base_score = 10; // S1
        let combo_bonus = if streak >= 3 { 5 } else { 0 }; // S4

        Ok((base_score, combo_bonus, streak))
    }

    // Rule S2: 0 points for incorrect answer, reset streak
    async fn process_incorrect_answer(&self, user_id: &str) -> Result<(i32, i32, u32)> {
        let mut conn = self.redis.clone();
        let streak_key = format!("score:series:{}", user_id);

        // Reset streak
        redis::cmd("DEL")
            .arg(&streak_key)
            .query_async::<()>(&mut conn)
            .await?;

        Ok((0, 0, 0))
    }

    async fn save_attempt(&self, attempt: &AttemptRecord) -> Result<()> {
        tracing::info!(
            "Saving attempt to MongoDB: user={}, task={}, correct={}",
            attempt.user_id,
            attempt.task_id,
            attempt.correct
        );

        // If configured to save asynchronously, spawn background task and return immediately
        let save_async =
            std::env::var("ANSWERS_SAVE_ASYNC").unwrap_or_else(|_| "1".to_string()) != "0";

        if save_async {
            let mongo = self.mongo.clone();
            let attempt_cloned = attempt.clone();

            tokio::spawn(async move {
                let cfg = RetryConfig::aggressive();
                let collection: mongodb::Collection<AttemptRecord> =
                    mongo.collection("attempt_records");

                let res: Result<_, mongodb::error::Error> =
                    retry_async_with_config(cfg, || async {
                        collection.insert_one(&attempt_cloned).await.map(|_| ())
                    })
                    .await;

                if let Err(e) = res {
                    tracing::error!("Background attempt save failed: {:#?}", e);
                    // TODO: Consider pushing to a durable retry queue (Redis/Dead-letter) for permanent failures
                } else {
                    tracing::info!("Background attempt saved: id={}", attempt_cloned.id);
                }
            });

            // Return immediately; caller doesn't wait for DB confirmation
            return Ok(());
        }

        // synchronous insert with aggressive retries
        let collection: mongodb::Collection<AttemptRecord> =
            self.mongo.collection("attempt_records");
        retry_async_with_config(RetryConfig::aggressive(), || async {
            collection.insert_one(attempt).await.map(|_| ())
        })
        .await
        .map_err(|e: mongodb::error::Error| anyhow::anyhow!(e))?;

        tracing::info!("Attempt saved successfully with id={}", attempt.id);
        Ok(())
    }

    async fn update_total_score(&self, user_id: &str, score_delta: i32) -> Result<i32> {
        let mut conn = self.redis.clone();
        let score_key = format!("user:score:{}", user_id);

        let total: i32 = redis::cmd("INCRBY")
            .arg(&score_key)
            .arg(score_delta)
            .query_async(&mut conn)
            .await
            .context("Failed to update total score")?;

        // Set TTL
        redis::cmd("EXPIRE")
            .arg(&score_key)
            .arg(86400) // 24 hours
            .query_async::<()>(&mut conn)
            .await?;

        Ok(total)
    }

    // Check if this request was already processed (idempotency)
    async fn check_idempotency(
        &self,
        idempotency_key: &str,
    ) -> Result<Option<SubmitAnswerResponse>> {
        let mut conn = self.redis.clone();
        let cache_key = format!("idempotency:answer:{}", idempotency_key);

        let cached: Option<String> = redis::cmd("GET")
            .arg(&cache_key)
            .query_async(&mut conn)
            .await
            .context("Failed to check idempotency cache")?;

        if let Some(json) = cached {
            let response: SubmitAnswerResponse =
                serde_json::from_str(&json).context("Failed to deserialize cached response")?;
            return Ok(Some(response));
        }

        Ok(None)
    }

    // Cache response for idempotency (24 hour TTL)
    async fn cache_response(
        &self,
        idempotency_key: &str,
        response: &SubmitAnswerResponse,
    ) -> Result<()> {
        let mut conn = self.redis.clone();
        let cache_key = format!("idempotency:answer:{}", idempotency_key);
        let json = serde_json::to_string(response).context("Failed to serialize response")?;

        redis::cmd("SETEX")
            .arg(&cache_key)
            .arg(86400) // 24 hours
            .arg(&json)
            .query_async::<()>(&mut conn)
            .await
            .context("Failed to cache response")?;

        Ok(())
    }

    // Get session from Redis
    async fn get_session(&self, session_id: &str) -> Result<Session> {
        let mut conn = self.redis.clone();
        let session_key = format!("session:{}", session_id);

        let session_json: Option<String> = redis::cmd("GET")
            .arg(&session_key)
            .query_async(&mut conn)
            .await
            .context("Failed to get session from Redis")?;

        let session_json = session_json.ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        let session: Session =
            serde_json::from_str(&session_json).context("Failed to deserialize session")?;

        Ok(session)
    }

    // Get correct answer from MongoDB tasks collection
    async fn get_correct_answer(&self, task_id: &str) -> Result<String> {
        let collection: mongodb::Collection<Task> = self.mongo.collection("tasks");

        let task = collection
            .find_one(mongodb::bson::doc! { "_id": task_id })
            .await
            .context("Failed to query tasks collection")?
            .ok_or_else(|| anyhow::anyhow!("Task {} not found", task_id))?;

        tracing::info!("Retrieved correct answer for task {}", task_id);
        Ok(task.correct_answer)
    }

    // Update progress summary with attempt result (Rule S5)
    async fn update_progress_summary(
        &self,
        user_id: &str,
        task_id: &str,
        is_correct: bool,
    ) -> Result<()> {
        // For S5, we track progress per level (not per task)
        // In real implementation, we'd get level_id from task
        // For now, we'll use a simplified approach with task_id as level_id
        let level_id = format!("level_{}", task_id);

        let collection: mongodb::Collection<ProgressSummary> =
            self.mongo.collection("progress_summary_v2");
        let summary_id = format!("{}:{}", user_id, level_id);

        // Try to get existing summary
        let existing = collection
            .find_one(mongodb::bson::doc! { "_id": &summary_id })
            .await?;

        let new_summary = if let Some(mut summary) = existing {
            // Update existing
            summary.attempts_total += 1;
            if is_correct {
                summary.correct_count += 1;
            }
            summary.percentage =
                (summary.correct_count as f64 / summary.attempts_total as f64) * 100.0;
            summary.updated_at = Utc::now();
            summary
        } else {
            // Create new
            ProgressSummary {
                id: summary_id.clone(),
                user_id: user_id.to_string(),
                level_id: level_id.clone(),
                attempts_total: 1,
                correct_count: if is_correct { 1 } else { 0 },
                percentage: if is_correct { 100.0 } else { 0.0 },
                score: 0, // Updated separately via total_score
                updated_at: Utc::now(),
            }
        };

        // Upsert the summary
        collection
            .replace_one(mongodb::bson::doc! { "_id": &summary_id }, &new_summary)
            .with_options(
                mongodb::options::ReplaceOptions::builder()
                    .upsert(true)
                    .build(),
            )
            .await
            .context("Failed to update progress summary")?;

        // Check S5 rule: 80% threshold for level completion
        if new_summary.attempts_total >= 5 && new_summary.percentage >= 80.0 {
            tracing::info!(
                "User {} achieved 80% threshold on level {} ({:.1}% with {} attempts) - ready for next level",
                user_id, level_id, new_summary.percentage, new_summary.attempts_total
            );
            // In real implementation, you'd update user's available levels here
        }

        Ok(())
    }

    // Helper to check whether background async saves are enabled via env var
    fn answers_save_async_enabled() -> bool {
        std::env::var("ANSWERS_SAVE_ASYNC").unwrap_or_else(|_| "1".to_string()) != "0"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_save_async_default_enabled() {
        std::env::remove_var("ANSWERS_SAVE_ASYNC");
        assert!(AnswerService::answers_save_async_enabled());
    }

    #[test]
    fn answers_save_async_can_be_disabled() {
        std::env::set_var("ANSWERS_SAVE_ASYNC", "0");
        assert!(!AnswerService::answers_save_async_enabled());
        std::env::remove_var("ANSWERS_SAVE_ASYNC");
    }
}
