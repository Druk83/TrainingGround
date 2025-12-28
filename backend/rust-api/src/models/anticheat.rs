use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::user::UserRole;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentRecord {
    pub id: String,
    pub user_id: String,
    pub incident_type: IncidentType,
    pub severity: IncidentSeverity,
    pub details: IncidentDetails,
    pub timestamp: DateTime<Utc>,
    pub action_taken: ActionTaken,
    #[serde(default)]
    pub status: IncidentStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution_note: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum IncidentStatus {
    #[default]
    Open,
    Resolved,
    FalsePositive,
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

#[derive(Debug, Clone, Serialize)]
pub struct IncidentUserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: UserRole,
    pub is_blocked: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct IncidentWithUser {
    pub incident: IncidentRecord,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<IncidentUserInfo>,
}

#[derive(Debug, Deserialize)]
pub struct ListIncidentsQuery {
    pub incident_type: Option<IncidentType>,
    pub severity: Option<IncidentSeverity>,
    pub status: Option<IncidentStatus>,
    pub user_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIncidentRequest {
    pub action: IncidentResolutionAction,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IncidentResolutionAction {
    Resolve,
    FalsePositive,
}
