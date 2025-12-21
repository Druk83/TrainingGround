use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentRecord {
    pub id: String,
    pub user_id: String,
    pub incident_type: IncidentType,
    pub severity: IncidentSeverity,
    pub details: IncidentDetails,
    pub timestamp: DateTime<Utc>,
    pub action_taken: ActionTaken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IncidentType {
    SpeedViolation,
    RepeatedAnswers,
    SuspiciousPattern,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IncidentSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionTaken {
    None,
    Flagged,
    Suspended,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentDetails {
    pub speed_hits: Option<u32>,
    pub repeated_hits: Option<u32>,
    pub time_window_seconds: Option<u32>,
    pub additional_info: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnticheatStatus {
    pub user_id: String,
    pub is_suspicious: bool,
    pub is_blocked: bool,
    pub speed_hits: u32,
    pub repeated_hits: u32,
    pub last_check: DateTime<Utc>,
}
