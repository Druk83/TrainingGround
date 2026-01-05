use crate::metrics::{track_cache_operation, SESSIONS_ACTIVE, SESSIONS_TOTAL};
use crate::models::{
    CreateSessionRequest, CreateSessionResponse, Session, SessionStatus, TaskInfo,
};
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use mongodb::Database;
use redis::aio::ConnectionManager;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct GenerateInstancesRequest {
    level_id: String,
    count: u32,
    user_id: String,
}

#[derive(Debug, Deserialize)]
struct GenerateInstancesResponse {
    instances: Vec<TaskInstance>,
}

#[derive(Debug, Deserialize)]
struct TaskInstance {
    task_id: String,
    text: String,
    correct_answer: String,
    options: Option<Vec<String>>,
    metadata: serde_json::Value,
}

pub struct SessionService {
    mongo: Database,
    redis: ConnectionManager,
    http_client: Client,
    python_api_url: String,
}

impl SessionService {
    pub fn new(mongo: Database, redis: ConnectionManager, python_api_url: String) -> Self {
        Self {
            mongo,
            redis,
            http_client: Client::new(),
            python_api_url,
        }
    }

    pub async fn create_session(&self, req: CreateSessionRequest) -> Result<CreateSessionResponse> {
        let session_id = Uuid::new_v4().to_string();

        // Попытка генерации через Template Generator если указан level_id
        let task = if let Some(ref level_id) = req.level_id {
            match self.generate_and_store_task(level_id, &req.user_id).await {
                Ok(generated_task) => {
                    tracing::info!(
                        "Generated task via Template Generator for level: {}",
                        level_id
                    );
                    generated_task
                }
                Err(e) => {
                    tracing::warn!(
                        "Template Generator failed ({}), falling back to MongoDB task_id: {}",
                        e,
                        req.task_id
                    );
                    self.fetch_task(&req.task_id).await?
                }
            }
        } else {
            // Fallback на готовое задание из MongoDB
            self.fetch_task(&req.task_id).await?
        };

        let now = Utc::now();
        let session_ttl = std::env::var("SESSION_DURATION_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(3600);
        let expires_at = now + chrono::Duration::seconds(session_ttl);

        let session = Session {
            id: session_id.clone(),
            user_id: req.user_id.clone(),
            task_id: task.id.clone(),
            group_id: req.group_id.clone(),
            started_at: now,
            expires_at,
            status: SessionStatus::Active,
            hints_used: 0,
            score: 0,
            level_id: req.level_id.clone(),
        };

        // Save to Redis with TTL - clone connection for this operation
        let mut conn = self.redis.clone();

        let session_key = format!("session:{}", session_id);
        let session_json = serde_json::to_string(&session)?;

        // Track cache operation with metrics
        track_cache_operation("setex", async {
            redis::cmd("SETEX")
                .arg(&session_key)
                .arg(3600) // TTL 1 hour
                .arg(session_json)
                .query_async::<()>(&mut conn)
                .await
                .context("Failed to save session to Redis")
        })
        .await?;

        // Record business metrics
        SESSIONS_TOTAL.with_label_values(&["created"]).inc();
        SESSIONS_ACTIVE.inc();

        tracing::info!("Session created: {} for user: {}", session_id, req.user_id);

        Ok(CreateSessionResponse {
            session_id,
            task: TaskInfo {
                id: task.id,
                title: task.title,
                description: task.description,
                time_limit_seconds: task.time_limit_seconds,
            },
            expires_at,
        })
    }

    pub async fn get_session(&self, session_id: &str) -> Result<Session> {
        // Get from Redis - clone connection for this operation
        let mut conn = self.redis.clone();

        let session_key = format!("session:{}", session_id);
        let session_json: String = redis::cmd("GET")
            .arg(&session_key)
            .query_async(&mut conn)
            .await
            .context("Session not found")?;

        let session: Session = serde_json::from_str(&session_json)?;

        Ok(session)
    }

    pub async fn complete_session(&self, session_id: &str) -> Result<()> {
        // Get session from Redis
        let _session = self.get_session(session_id).await?;

        // TODO: Update MongoDB with final results

        // Delete from Redis - clone connection for this operation
        let mut conn = self.redis.clone();

        let session_key = format!("session:{}", session_id);
        track_cache_operation("del", async {
            redis::cmd("DEL")
                .arg(&session_key)
                .query_async::<()>(&mut conn)
                .await
                .context("Failed to delete session from Redis")
        })
        .await?;

        // Record business metrics
        SESSIONS_TOTAL.with_label_values(&["completed"]).inc();
        SESSIONS_ACTIVE.dec();

        tracing::info!("Session completed: {}", session_id);

        Ok(())
    }

    async fn fetch_task(&self, task_id: &str) -> Result<FetchedTask> {
        let tasks_collection = self.mongo.collection::<Document>("tasks");
        let filter = if let Ok(object_id) = ObjectId::parse_str(task_id) {
            doc! { "_id": object_id }
        } else {
            doc! { "_id": task_id }
        };

        let task = tasks_collection
            .find_one(filter)
            .await
            .context("Failed to query task")?
            .ok_or_else(|| anyhow!("Task not found"))?;

        let id = match task.get("_id") {
            Some(Bson::ObjectId(oid)) => oid.to_hex(),
            Some(Bson::String(value)) => value.to_string(),
            _ => return Err(anyhow!("Task has unsupported _id type")),
        };

        let title = task
            .get_str("title")
            .map_err(|_| anyhow!("Task title missing"))?
            .to_string();
        let description = task
            .get_str("description")
            .map_err(|_| anyhow!("Task description missing"))?
            .to_string();
        let time_limit_seconds = task
            .get_i32("time_limit_seconds")
            .or_else(|_| task.get_i64("time_limit_seconds").map(|v| v as i32))
            .map_err(|_| anyhow!("Task time limit missing"))?;

        Ok(FetchedTask {
            id,
            title,
            description,
            time_limit_seconds: time_limit_seconds as u32,
        })
    }

    /// Генерация задания через Template Generator и сохранение в MongoDB
    async fn generate_and_store_task(&self, level_id: &str, user_id: &str) -> Result<FetchedTask> {
        // Генерируем одно задание через Template Generator
        let instances = self.generate_task_instances(level_id, user_id, 1).await?;

        if instances.is_empty() {
            return Err(anyhow!("Template Generator returned no instances"));
        }

        let instance = &instances[0];

        // Сохраняем сгенерированное задание в MongoDB tasks коллекцию
        let tasks_collection = self.mongo.collection::<Document>("tasks");

        let now = Utc::now();
        let now_bson = mongodb::bson::DateTime::from_millis(now.timestamp_millis());

        let metadata_bson =
            mongodb::bson::to_bson(&instance.metadata).unwrap_or(Bson::Document(doc! {}));
        let template_object_id = instance
            .metadata
            .get("template_id")
            .and_then(|value| value.as_str())
            .and_then(|value| ObjectId::parse_str(value).ok())
            .ok_or_else(|| anyhow!("Generated task missing template_id"))?;

        let meta_title = instance
            .metadata
            .get("title")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let meta_description = instance
            .metadata
            .get("description")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let meta_time_limit = instance
            .metadata
            .get("time_limit_seconds")
            .and_then(|value| value.as_i64())
            .unwrap_or(300);

        let title = meta_title.unwrap_or_else(|| {
            format!(
                "Generated task from level {}",
                level_id.chars().take(8).collect::<String>()
            )
        });
        let description = meta_description.unwrap_or_else(|| instance.text.clone());
        let time_limit_seconds = meta_time_limit.max(60) as i32;

        let task_doc = doc! {
            "template_id": template_object_id,
            "session_id": Uuid::new_v4().to_string(),
            "title": &title,
            "description": &description,
            "time_limit_seconds": time_limit_seconds,
            "content": {
                "text": &instance.text,
                "correct_answer": &instance.correct_answer,
                "options": instance.options.as_ref().map(|opts| {
                    opts.iter().map(|s| Bson::String(s.clone())).collect::<Vec<Bson>>()
                }),
            },
            "correct_answer": &instance.correct_answer,
            "hints": [],
            "createdAt": now_bson,
            "metadata": metadata_bson,
        };

        let insert_result = tasks_collection
            .insert_one(task_doc)
            .await
            .context("Failed to insert generated task into MongoDB")?;

        let inserted_id = match insert_result.inserted_id {
            Bson::ObjectId(oid) => oid.to_hex(),
            _ => return Err(anyhow!("Failed to get inserted task ID")),
        };

        tracing::info!("Stored generated task in MongoDB: {}", inserted_id);

        // Возвращаем задание в формате FetchedTask
        Ok(FetchedTask {
            id: inserted_id,
            title: format!("Generated task from level {}", level_id),
            description: instance.text.clone(),
            time_limit_seconds: 300, // 5 минут по умолчанию
        })
    }

    /// Генерация экземпляров заданий через Template Generator (Python API)
    async fn generate_task_instances(
        &self,
        level_id: &str,
        user_id: &str,
        count: u32,
    ) -> Result<Vec<TaskInstance>> {
        let url = format!("{}/internal/generate_instances", self.python_api_url);

        let request_payload = GenerateInstancesRequest {
            level_id: level_id.to_string(),
            count,
            user_id: user_id.to_string(),
        };

        tracing::debug!(
            "Calling Template Generator API: {} with level_id={}, count={}",
            url,
            level_id,
            count
        );

        let response = self
            .http_client
            .post(&url)
            .json(&request_payload)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .context("Failed to call Template Generator API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow!(
                "Template Generator returned error {}: {}",
                status,
                error_text
            ));
        }

        let api_response: GenerateInstancesResponse = response
            .json()
            .await
            .context("Failed to parse Template Generator response")?;

        tracing::info!(
            "Generated {} task instances for level {} and user {}",
            api_response.instances.len(),
            level_id,
            user_id
        );

        Ok(api_response.instances)
    }
}

struct FetchedTask {
    id: String,
    title: String,
    description: String,
    time_limit_seconds: u32,
}
