use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SubmitAnswerRequest {
    pub answer: String,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitAnswerResponse {
    pub correct: bool,
    pub score_awarded: i32,
    pub combo_bonus: i32,
    pub total_score: i32,
    pub current_streak: u32,
    pub feedback: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptRecord {
    pub id: String,
    pub session_id: String,
    pub user_id: String,
    pub task_id: String,
    pub answer: String,
    pub correct: bool,
    pub score: i32,
    pub timestamp: DateTime<Utc>,
    pub reason: Option<AttemptFailureReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttemptFailureReason {
    WrongAnswer,
    Timeout,
    InvalidFormat,
}
