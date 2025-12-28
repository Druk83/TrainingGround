use chrono::{DateTime, Utc};
use mongodb::bson::{oid::ObjectId, Document};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSetting {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub key: String,
    pub category: String,
    pub value: Document,
    #[serde(rename = "updatedBy", skip_serializing_if = "Option::is_none")]
    pub updated_by: Option<String>,
    #[serde(rename = "updatedAt", with = "bson_datetime_as_chrono")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YandexGptSettings {
    pub api_key: String,
    pub folder_id: String,
    #[serde(default = "default_yandex_model")]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoSettings {
    pub enabled: bool,
    pub provider: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailSettings {
    pub server: String,
    pub port: u16,
    pub login: String,
    pub password: String,
    pub from_email: String,
    pub from_name: String,
    #[serde(default)]
    pub use_tls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnticheatSettings {
    pub speed_threshold_seconds: u32,
    pub max_speed_hits: u32,
    pub max_repeated_hits: u32,
    pub block_duration_hours: u32,
    pub captcha_enabled: bool,
    pub captcha_threshold: u32,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct SystemSettingsResponse {
    pub yandexgpt: Option<YandexGptSettings>,
    pub sso: Option<SsoSettings>,
    pub email: Option<EmailSettings>,
    pub anticheat: Option<AnticheatSettings>,
}

#[derive(Debug, Serialize)]
pub struct SettingsTestResponse {
    pub success: bool,
    pub message: Option<String>,
}

fn default_yandex_model() -> String {
    "yandexgpt".to_string()
}

fn default_temperature() -> f32 {
    0.3
}

fn default_max_tokens() -> u32 {
    500
}

// Reuse chrono conversion helpers
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
        Ok(DateTime::from_timestamp_millis(bson_dt.timestamp_millis()).expect("valid timestamp"))
    }
}
