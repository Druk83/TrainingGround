use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub task_id: String,
    pub group_id: Option<String>,
    pub started_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub status: SessionStatus,
    pub hints_used: u32,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Completed,
    Expired,
    Abandoned,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub user_id: String,
    pub task_id: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub task: TaskInfo,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct TaskInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub time_limit_seconds: u32,
}

pub mod answer;
pub mod anticheat;
pub mod hint;
pub mod reporting;
pub mod timer;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    #[serde(rename = "_id")]
    pub id: String,
    pub title: String,
    pub description: String,
    pub correct_answer: String,
    pub time_limit_seconds: u32,
    pub difficulty: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressSummary {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub level_id: String,
    pub attempts_total: u32,
    pub correct_count: u32,
    pub percentage: f64,
    pub score: i32,
    pub updated_at: DateTime<Utc>,
}
