use chrono::{DateTime, Utc};
use mongodb::bson::{doc, Document};
use serde::{Deserialize, Serialize};

/// Scope for feature flag targeting
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FlagScope {
    /// Global flag applies to all users
    #[serde(rename = "global")]
    Global,
    /// Group-level flag applies to specific groups
    #[serde(rename = "group")]
    Group,
    /// User-level flag applies to specific users
    #[serde(rename = "user")]
    User,
}

/// Feature flag stored in MongoDB "feature_flags" collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlag {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,

    /// Unique flag key (e.g., "hints_enabled", "sso_oauth2")
    pub flag_key: String,

    /// Human-readable description
    #[serde(default)]
    pub description: String,

    /// Whether flag is enabled
    pub enabled: bool,

    /// Scope: global, group, or user
    pub scope: String,

    /// Target IDs for group/user scope (group IDs or user IDs)
    #[serde(default)]
    pub target_ids: Vec<String>,

    /// JSON configuration for the flag (e.g., parameters)
    #[serde(default)]
    pub config: Document,

    /// Version number (for tracking changes)
    pub version: i32,

    /// Timestamp when flag was last updated
    #[serde(with = "bson_datetime_as_chrono")]
    pub updated_at: DateTime<Utc>,

    /// Admin who updated this flag
    #[serde(default)]
    pub updated_by: String,

    /// Reason for change
    #[serde(default)]
    pub change_reason: String,
}

/// Request to create/update feature flag
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlagCreateRequest {
    pub flag_key: String,
    #[serde(default)]
    pub description: String,
    pub enabled: bool,
    pub scope: String,
    #[serde(default)]
    pub target_ids: Vec<String>,
    #[serde(default)]
    pub config: Document,
    #[serde(default)]
    pub change_reason: String,
}

/// Response for feature flag
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlagResponse {
    pub flag_key: String,
    pub description: String,
    pub enabled: bool,
    pub scope: String,
    pub target_ids: Vec<String>,
    pub config: Document,
    pub version: i32,
    pub updated_at: DateTime<Utc>,
    pub updated_by: String,
}

impl From<FeatureFlag> for FeatureFlagResponse {
    fn from(flag: FeatureFlag) -> Self {
        FeatureFlagResponse {
            flag_key: flag.flag_key,
            description: flag.description,
            enabled: flag.enabled,
            scope: flag.scope,
            target_ids: flag.target_ids,
            config: flag.config,
            version: flag.version,
            updated_at: flag.updated_at,
            updated_by: flag.updated_by,
        }
    }
}

// Datetime serialization helper
mod bson_datetime_as_chrono {
    use chrono::{DateTime, Utc};
    use mongodb::bson::DateTime as BsonDateTime;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date_time: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&date_time.to_rfc3339())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bson_datetime = BsonDateTime::deserialize(deserializer)?;
        let millis = bson_datetime.timestamp_millis();
        Ok(DateTime::<Utc>::from_timestamp_millis(millis).unwrap_or_else(Utc::now))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flag_scope_serialization() {
        let flag = FeatureFlagCreateRequest {
            flag_key: "test_flag".to_string(),
            description: "Test flag".to_string(),
            enabled: true,
            scope: "global".to_string(),
            target_ids: vec![],
            config: Document::default(),
            change_reason: "Testing".to_string(),
        };

        let json = serde_json::to_string(&flag).expect("Failed to serialize");
        assert!(json.contains("test_flag"));
        assert!(json.contains("global"));
    }
}
