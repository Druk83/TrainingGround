use crate::metrics::{track_cache_operation, SESSIONS_ACTIVE, SESSIONS_TOTAL};
use crate::models::{
    CreateSessionRequest, CreateSessionResponse, Session, SessionStatus, TaskInfo,
};
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use mongodb::Database;
use redis::aio::ConnectionManager;
use uuid::Uuid;

pub struct SessionService {
    mongo: Database,
    redis: ConnectionManager,
}

impl SessionService {
    pub fn new(mongo: Database, redis: ConnectionManager) -> Self {
        Self { mongo, redis }
    }

    pub async fn create_session(&self, req: CreateSessionRequest) -> Result<CreateSessionResponse> {
        let session_id = Uuid::new_v4().to_string();
        let task = self.fetch_task(&req.task_id).await?;

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
            task_id: req.task_id.clone(),
            group_id: req.group_id.clone(),
            started_at: now,
            expires_at,
            status: SessionStatus::Active,
            hints_used: 0,
            score: 0,
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
}

struct FetchedTask {
    id: String,
    title: String,
    description: String,
    time_limit_seconds: u32,
}
