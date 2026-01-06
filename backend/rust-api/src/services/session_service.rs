use crate::metrics::{track_cache_operation, SESSIONS_ACTIVE, SESSIONS_TOTAL};
use crate::models::{
    content::LevelRecord, CreateSessionRequest, CreateSessionResponse, Session, SessionStatus,
    TaskInfo,
};
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use mongodb::options::FindOptions;
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
                    match self.fetch_task(&req.task_id).await {
                        Ok(task) => task,
                        Err(fetch_err) => {
                            tracing::warn!(
                                "Legacy task lookup failed for id {}, trying cached tasks for level {} ({})",
                                req.task_id,
                                level_id,
                                fetch_err
                            );
                            self.fetch_recent_task_for_level(level_id).await?
                        }
                    }
                }
            }
        } else {
            // Fallback на готовое задание из MongoDB
            self.fetch_task(&req.task_id).await?
        };

        let now = Utc::now();
        let default_ttl = std::env::var("SESSION_DURATION_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(3600);
        let enforced_ttl = req.session_duration_seconds.unwrap_or(default_ttl);
        let expires_at = now + chrono::Duration::seconds(enforced_ttl);

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

        let response_time_limit = req
            .session_duration_seconds
            .map(|value| value.max(60) as u32)
            .unwrap_or(task.time_limit_seconds);

        Ok(CreateSessionResponse {
            session_id,
            task: TaskInfo {
                id: task.id,
                title: task.title,
                description: task.description,
                time_limit_seconds: response_time_limit,
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
            .find_one(filter.clone())
            .await
            .context("Failed to query task")?
            .ok_or_else(|| anyhow!("Task not found"))?;

        let mut fetched = Self::task_from_document(&task)?;
        if fetched.title.starts_with("Generated task from level") {
            let mut resolved_label = Self::extract_level_label(&task);
            if resolved_label.is_none() {
                if let Some(level_id) = Self::extract_level_id(&task) {
                    resolved_label = self.load_level_label(&level_id).await;
                }
            }

            if let Some(label) = resolved_label {
                let normalized_title = format!("{} — задание", label.clone());
                if normalized_title != fetched.title {
                    let update = doc! {
                        "$set": {
                            "title": &normalized_title,
                            "level_label": &label,
                        }
                    };
                    let _ = tasks_collection.update_one(filter, update).await;
                }
                fetched.title = normalized_title;
            }
        }

        Ok(fetched)
    }

    async fn fetch_recent_task_for_level(&self, level_id: &str) -> Result<FetchedTask> {
        let tasks_collection = self.mongo.collection::<Document>("tasks");
        let options = FindOptions::builder()
            .sort(doc! { "createdAt": -1 })
            .limit(1)
            .build();

        let mut cursor = tasks_collection
            .find(doc! { "metadata.level_id": level_id })
            .with_options(options)
            .await
            .context("Failed to query cached task by level")?;

        let task = cursor
            .try_next()
            .await
            .context("Failed to iterate cached tasks by level")?
            .ok_or_else(|| anyhow!("No cached tasks found for level {}", level_id))?;

        tracing::info!(
            "Using cached generated task for level {} from MongoDB",
            level_id
        );

        let mut fetched = Self::task_from_document(&task)?;
        if fetched.title.starts_with("Generated task from level") {
            let mut resolved_label = Self::extract_level_label(&task);
            if resolved_label.is_none() {
                if let Some(level_id) = Self::extract_level_id(&task) {
                    resolved_label = self.load_level_label(&level_id).await;
                }
            }

            if let Some(label) = resolved_label {
                let normalized_title = format!("{} — задание", label.clone());
                if normalized_title != fetched.title {
                    if let Some(id_filter) = Self::document_id_filter(&task) {
                        let update = doc! {
                            "$set": {
                                "title": &normalized_title,
                                "level_label": &label,
                            }
                        };
                        let _ = tasks_collection.update_one(id_filter, update).await;
                    }
                }
                fetched.title = normalized_title;
            }
        }

        Ok(fetched)
    }

    /// Генерация задания через Template Generator и сохранение в MongoDB
    async fn generate_and_store_task(&self, level_id: &str, user_id: &str) -> Result<FetchedTask> {
        let instances = self.generate_task_instances(level_id, user_id, 1).await?;

        if instances.is_empty() {
            return Err(anyhow!("Template Generator returned no instances"));
        }

        let instance = &instances[0];
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

        let level_label = self
            .load_level_label(level_id)
            .await
            .unwrap_or_else(|| format!("Уровень {}", level_id.chars().take(6).collect::<String>()));
        let fallback_title = format!("{} — задание", level_label.clone());
        let title = meta_title.unwrap_or_else(|| fallback_title.clone());
        let description = meta_description.unwrap_or_else(|| instance.text.clone());
        let time_limit_seconds = meta_time_limit.max(60) as i32;
        let level_bson = ObjectId::parse_str(level_id)
            .map(Bson::ObjectId)
            .unwrap_or_else(|_| Bson::String(level_id.to_string()));

        let task_doc = doc! {
            "template_id": template_object_id,
            "session_id": Uuid::new_v4().to_string(),
            "title": &title,
            "description": &description,
            "time_limit_seconds": time_limit_seconds,
            "level_id": level_bson.clone(),
            "level_label": &level_label,
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

        Ok(FetchedTask {
            id: inserted_id,
            title,
            description,
            time_limit_seconds: 300, // 5 минут по умолчанию
        })
    }
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

impl SessionService {
    async fn load_level_label(&self, level_id: &str) -> Option<String> {
        let object_id = ObjectId::parse_str(level_id).ok()?;
        let collection = self.mongo.collection::<LevelRecord>("levels");
        match collection.find_one(doc! { "_id": object_id }).await {
            Ok(Some(level)) => Some(level.name),
            Ok(None) => None,
            Err(err) => {
                tracing::warn!("Failed to load level {}: {}", level_id, err);
                None
            }
        }
    }

    fn extract_level_label(task: &Document) -> Option<String> {
        task.get_str("level_label")
            .ok()
            .map(|value| value.to_string())
            .or_else(|| {
                task.get("metadata")
                    .and_then(|value| value.as_document())
                    .and_then(|doc| doc.get_str("level_label").ok())
                    .map(|value| value.to_string())
            })
    }

    fn extract_level_id(task: &Document) -> Option<String> {
        match task.get("level_id") {
            Some(Bson::ObjectId(oid)) => Some(oid.to_hex()),
            Some(Bson::String(value)) => Some(value.to_string()),
            _ => task
                .get("metadata")
                .and_then(|value| value.as_document())
                .and_then(|doc| doc.get_str("level_id").ok())
                .map(|value| value.to_string()),
        }
    }

    fn document_id_filter(task: &Document) -> Option<Document> {
        match task.get("_id")? {
            Bson::ObjectId(oid) => Some(doc! { "_id": *oid }),
            Bson::String(value) => Some(doc! { "_id": value.clone() }),
            other => Some(doc! { "_id": other.clone() }),
        }
    }

    fn task_from_document(task: &Document) -> Result<FetchedTask> {
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
}
