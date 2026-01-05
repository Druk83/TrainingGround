use anyhow::{Context, Result};
use chrono::Utc;
use mongodb::Database;
use redis::aio::ConnectionManager;
use uuid::Uuid;

use crate::models::hint::{HintRecord, HintSource, RequestHintRequest, RequestHintResponse};

const HINT_COST: i32 = 5;
const CACHE_TTL: u64 = 300; // 5 minutes

pub struct HintService {
    mongo: Database,
    redis: ConnectionManager,
    python_api_url: String,
}

impl HintService {
    pub fn new(mongo: Database, redis: ConnectionManager, python_api_url: String) -> Self {
        Self {
            mongo,
            redis,
            python_api_url,
        }
    }

    pub async fn request_hint(
        &self,
        session_id: &str,
        user_id: &str,
        task_id: &str,
        req: &RequestHintRequest,
    ) -> Result<RequestHintResponse> {
        tracing::info!(
            "Processing hint request: session={}, user={}, task={}",
            session_id,
            user_id,
            task_id
        );

        let max_hints = Self::max_hints_per_session();
        // Check hints limit using Lua script for atomicity (unless limit disabled)
        let hints_used = if let Some(limit) = max_hints {
            let used = self.check_and_increment_hints(session_id, limit).await?;

            if used > limit {
                anyhow::bail!("Maximum hints limit reached ({})", limit);
            }

            used
        } else {
            self.increment_hints_counter(session_id).await?
        };

        // Deduct points BEFORE providing hint (Rule S3)
        let new_score = self.deduct_hint_cost(user_id).await?;

        // Get hint text (cache -> Python API -> fallback)
        let (hint_text, source) = self.get_hint_text(task_id, req).await?;

        // Save hint record to MongoDB
        let record = HintRecord {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            user_id: user_id.to_string(),
            task_id: task_id.to_string(),
            hint_text: hint_text.clone(),
            cost: HINT_COST,
            timestamp: Utc::now(),
            source,
        };

        self.save_hint_record(&record).await?;

        tracing::info!(
            "Hint provided: session={}, hints_used={}, new_score={}",
            session_id,
            hints_used,
            new_score
        );

        Ok(RequestHintResponse {
            hint: hint_text.clone(),
            hint_text,
            hints_used,
            hints_remaining: max_hints
                .map(|limit| limit.saturating_sub(hints_used))
                .unwrap_or(u32::MAX),
            cost: HINT_COST,
            new_score,
        })
    }

    // Lua script ensures atomic check + increment
    async fn check_and_increment_hints(&self, session_id: &str, max_hints: u32) -> Result<u32> {
        let mut conn = self.redis.clone();
        let key = format!("hints_used:{}", session_id);

        let lua_script = r#"
            local key = KEYS[1]
            local max_hints = tonumber(ARGV[1])
            local current = redis.call('GET', key)
            
            if current == false then
                current = 0
            else
                current = tonumber(current)
            end
            
            if current >= max_hints then
                return current + 1
            end
            
            redis.call('INCR', key)
            redis.call('EXPIRE', key, 3600)
            
            return current + 1
        "#;

        let hints_used: u32 = redis::Script::new(lua_script)
            .key(&key)
            .arg(max_hints)
            .invoke_async(&mut conn)
            .await
            .context("Failed to execute hints limit Lua script")?;

        Ok(hints_used)
    }

    /// Increment counter without enforcing limit (used when limit disabled)
    async fn increment_hints_counter(&self, session_id: &str) -> Result<u32> {
        let mut conn = self.redis.clone();
        let key = format!("hints_used:{}", session_id);

        let hints_used: u32 = redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .context("Failed to increment hints counter")?;

        redis::cmd("EXPIRE")
            .arg(&key)
            .arg(3600)
            .query_async::<()>(&mut conn)
            .await?;

        Ok(hints_used)
    }

    // Rule S3: Deduct -5 points for hint
    async fn deduct_hint_cost(&self, user_id: &str) -> Result<i32> {
        let mut conn = self.redis.clone();
        let score_key = format!("user:score:{}", user_id);

        let new_score: i32 = redis::cmd("INCRBY")
            .arg(&score_key)
            .arg(-HINT_COST)
            .query_async(&mut conn)
            .await
            .context("Failed to deduct hint cost")?;

        Ok(new_score)
    }

    async fn get_hint_text(
        &self,
        task_id: &str,
        req: &RequestHintRequest,
    ) -> Result<(String, HintSource)> {
        // 1. Try cache first
        if let Ok(cached) = self.get_cached_hint(task_id).await {
            tracing::debug!("Hint found in cache for task={}", task_id);
            return Ok((cached, HintSource::Cache));
        }

        // 2. Try Python Explanation API with 2s timeout (if enabled)
        if Self::python_api_enabled() {
            match self.fetch_from_python_api(task_id, req).await {
                Ok(hint) => {
                    // Cache the result
                    self.cache_hint(task_id, &hint).await.ok();
                    tracing::debug!("Hint fetched from Python API for task={}", task_id);
                    return Ok((hint, HintSource::PythonApi));
                }
                Err(e) => {
                    tracing::warn!("Python API failed for task={}: {}", task_id, e);
                }
            }
        } else {
            tracing::debug!(
                "Python API disabled via env; skipping call for task={}",
                task_id
            );
        }

        // 3. Fallback to static hint from MongoDB
        let fallback = self.get_fallback_hint(task_id).await?;
        tracing::debug!("Using fallback hint for task={}", task_id);
        Ok((fallback, HintSource::Fallback))
    }

    async fn get_cached_hint(&self, task_id: &str) -> Result<String> {
        let mut conn = self.redis.clone();
        let cache_key = format!("explanation:cache:{}", task_id);

        let raw: String = redis::cmd("GET")
            .arg(&cache_key)
            .query_async(&mut conn)
            .await
            .context("Hint not in cache")?;

        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(explanation) = json_value
                .get("response")
                .and_then(|v| v.get("explanation"))
                .and_then(|v| v.as_str())
            {
                return Ok(explanation.to_string());
            }
            if let Some(explanation) = json_value.get("explanation").and_then(|v| v.as_str()) {
                return Ok(explanation.to_string());
            }
        }

        Ok(raw)
    }

    async fn fetch_from_python_api(
        &self,
        task_id: &str,
        req: &RequestHintRequest,
    ) -> Result<String> {
        let url = format!("{}/v1/explanations", self.python_api_url);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()?;

        let language = req.language.clone().unwrap_or_else(|| "ru".to_string());

        let body = serde_json::json!({
            "task_id": task_id,
            "topic_id": req.topic_id.clone(),
            "task_type": req.task_type.clone(),
            "user_errors": req.user_errors.clone(),
            "language_level": req.language_level.clone(),
            "language": language,
            "request_id": req.idempotency_key.clone(),
        });

        let response = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .context("Failed to call Python API")?;

        if !response.status().is_success() {
            anyhow::bail!("Python API returned status: {}", response.status());
        }

        let body: serde_json::Value = response.json().await?;
        let hint_text = body["explanation"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid response format"))?
            .to_string();

        Ok(hint_text)
    }

    async fn cache_hint(&self, task_id: &str, hint: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        let cache_key = format!("explanation:cache:{}", task_id);

        let _: () = redis::cmd("SETEX")
            .arg(&cache_key)
            .arg(CACHE_TTL)
            .arg(hint)
            .query_async(&mut conn)
            .await
            .context("Failed to cache hint")?;

        Ok(())
    }

    async fn get_fallback_hint(&self, task_id: &str) -> Result<String> {
        let collection: mongodb::Collection<mongodb::bson::Document> =
            self.mongo.collection("tasks");

        let filter = mongodb::bson::doc! { "_id": task_id };

        match collection.find_one(filter).await {
            Ok(Some(task)) => {
                let hint = task
                    .get_str("hint")
                    .or_else(|_| task.get_str("static_hint"))
                    .unwrap_or("Try to think about the problem from a different angle.")
                    .to_string();
                Ok(hint)
            }
            Ok(None) => {
                tracing::warn!("Task {} not found in MongoDB, using default hint", task_id);
                Ok("Try to think about the problem from a different angle.".to_string())
            }
            Err(e) => {
                tracing::error!("Failed to query tasks collection: {}", e);
                Ok("Try to think about the problem from a different angle.".to_string())
            }
        }
    }

    async fn save_hint_record(&self, record: &HintRecord) -> Result<()> {
        tracing::info!(
            "Saving hint record to MongoDB: user={}, task={}, source={:?}",
            record.user_id,
            record.task_id,
            record.source
        );

        let collection: mongodb::Collection<HintRecord> = self.mongo.collection("hint_records");

        collection
            .insert_one(record)
            .await
            .context("Failed to save hint record to MongoDB")?;

        tracing::info!("Hint record saved successfully with id={}", record.id);
        Ok(())
    }

    fn max_hints_per_session() -> Option<u32> {
        match std::env::var("HINTS_MAX_PER_SESSION") {
            Ok(value) => match value.parse::<i64>() {
                Ok(parsed) if parsed <= 0 => None,
                Ok(parsed) => Some(parsed as u32),
                Err(_) => Some(2),
            },
            Err(_) => Some(2),
        }
    }

    fn python_api_enabled() -> bool {
        std::env::var("HINTS_PYTHON_API_ENABLED").unwrap_or_else(|_| "0".to_string()) == "1"
    }
}
