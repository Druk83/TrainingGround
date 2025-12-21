use crate::models::{
    CreateSessionRequest, CreateSessionResponse, Session, SessionStatus, TaskInfo,
};
use anyhow::{Context, Result};
use chrono::Utc;
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

        // TODO: Get task from MongoDB tasks collection
        // For now, using mock data
        let task = TaskInfo {
            id: req.task_id.clone(),
            title: "Sample Task".to_string(),
            description: "Solve the programming problem".to_string(),
            time_limit_seconds: 300,
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

        redis::cmd("SETEX")
            .arg(&session_key)
            .arg(3600) // TTL 1 hour
            .arg(session_json)
            .query_async::<()>(&mut conn)
            .await
            .context("Failed to save session to Redis")?;

        tracing::info!("Session created: {} for user: {}", session_id, req.user_id);

        Ok(CreateSessionResponse {
            session_id,
            task,
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
        redis::cmd("DEL")
            .arg(&session_key)
            .query_async::<()>(&mut conn)
            .await
            .context("Failed to delete session from Redis")?;

        tracing::info!("Session completed: {}", session_id);

        Ok(())
    }
}
