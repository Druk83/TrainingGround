use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestHintRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestHintResponse {
    pub hint: String,
    pub hint_text: String,
    pub hints_used: u32,
    pub hints_remaining: u32,
    pub cost: i32,
    pub new_score: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HintRecord {
    pub id: String,
    pub session_id: String,
    pub user_id: String,
    pub task_id: String,
    pub hint_text: String,
    pub cost: i32,
    pub timestamp: DateTime<Utc>,
    pub source: HintSource,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HintSource {
    PythonApi,
    Fallback,
    Cache,
}
