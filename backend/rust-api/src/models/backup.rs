use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackupStatus {
    Pending,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub label: String,
    pub status: BackupStatus,
    pub storage_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupCreateRequest {
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BackupCreateResponse {
    pub id: String,
    pub status: BackupStatus,
    pub storage_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BackupRestoreResponse {
    pub id: String,
    pub status: BackupStatus,
    pub storage_path: Option<String>,
    pub message: String,
}

pub(super) mod bson_datetime_as_chrono {
    use chrono::{DateTime, Utc};
    use mongodb::bson;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let bson_dt = bson::DateTime::from_millis(date.timestamp_millis());
        bson_dt.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bson_dt = bson::DateTime::deserialize(deserializer)?;
        Ok(DateTime::from_timestamp_millis(bson_dt.timestamp_millis()).unwrap())
    }
}
