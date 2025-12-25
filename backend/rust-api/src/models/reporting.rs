use chrono::{DateTime, Utc};
use mongodb::bson::{oid::ObjectId, Document};
use serde::{Deserialize, Serialize};

use super::ProgressSummary;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterializedStat {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    #[serde(rename = "type")]
    pub stat_type: StatType,
    #[serde(rename = "entity_id")]
    pub entity_id: ObjectId,
    pub metrics: Document,
    #[serde(rename = "calculatedAt")]
    pub calculated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatType {
    Group,
    Level,
    Topic,
}

impl StatType {
    pub fn as_str(&self) -> &'static str {
        match self {
            StatType::Group => "group",
            StatType::Level => "level",
            StatType::Topic => "topic",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardDocument {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub scope: LeaderboardScope,
    pub scope_id: Option<ObjectId>,
    pub rankings: Vec<LeaderboardEntry>,
    #[serde(rename = "generatedAt")]
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeaderboardScope {
    Global,
    Group,
    Level,
}

impl LeaderboardScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            LeaderboardScope::Global => "global",
            LeaderboardScope::Group => "group",
            LeaderboardScope::Level => "level",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    #[serde(rename = "user_id")]
    pub user_id: ObjectId,
    pub score: i64,
    pub rank: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportExport {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    #[serde(rename = "group_id")]
    pub group_id: ObjectId,
    #[serde(rename = "teacher_id")]
    pub teacher_id: ObjectId,
    pub status: ExportStatus,
    pub format: ExportFormat,
    #[serde(rename = "storage_key")]
    pub storage_key: Option<String>,
    pub filters: ReportFilters,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "expiresAt")]
    pub expires_at: DateTime<Utc>,
    #[serde(rename = "completedAt")]
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportFilters {
    #[serde(default)]
    pub topic_ids: Vec<ObjectId>,
    pub period: TimeRange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewReportExport {
    pub group_id: ObjectId,
    pub teacher_id: ObjectId,
    pub format: ExportFormat,
    pub filters: ReportFilters,
    pub expires_at: DateTime<Utc>,
}

impl NewReportExport {
    pub fn into_record(self) -> ReportExport {
        let now = Utc::now();
        ReportExport {
            id: ObjectId::new(),
            group_id: self.group_id,
            teacher_id: self.teacher_id,
            status: ExportStatus::Pending,
            format: self.format,
            storage_key: None,
            filters: self.filters,
            created_at: now,
            expires_at: self.expires_at,
            completed_at: None,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportStatus {
    Pending,
    Processing,
    Ready,
    Failed,
}

impl ExportStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, ExportStatus::Ready | ExportStatus::Failed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Csv,
    Pdf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupAnalyticsSnapshot {
    pub group_id: ObjectId,
    pub metrics: Document,
    pub calculated_at: DateTime<Utc>,
    pub leaderboard: Option<LeaderboardDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAnalyticsSnapshot {
    pub user_id: ObjectId,
    pub progress: Vec<ProgressSummary>,
    pub last_activity_at: Option<DateTime<Utc>>,
}
