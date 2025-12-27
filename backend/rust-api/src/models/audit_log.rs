use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

/// Audit log entry for authentication and authorization events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,

    /// Type of event (login, logout, register, etc.)
    pub event_type: AuditEventType,

    /// User ID if authenticated (None for failed login attempts)
    pub user_id: Option<String>,

    /// Email/username used in the operation
    pub email: Option<String>,

    /// Whether the operation was successful
    pub success: bool,

    /// IP address of the client
    pub ip: Option<String>,

    /// User-Agent header
    pub user_agent: Option<String>,

    /// Additional details about the event
    pub details: Option<String>,

    /// Error message if operation failed
    pub error_message: Option<String>,

    /// Timestamp of the event
    #[serde(rename = "createdAt", with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,
}

/// Types of audit events
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    Login,
    LoginFailed,
    Register,
    RegisterFailed,
    Logout,
    RefreshToken,
    RefreshTokenFailed,
    ChangePassword,
    ChangePasswordFailed,
    RevokeSession,
    UpdateUser,
    AccessDenied,
}

impl AuditEventType {
    pub fn as_str(&self) -> &str {
        match self {
            AuditEventType::Login => "login",
            AuditEventType::LoginFailed => "login_failed",
            AuditEventType::Register => "register",
            AuditEventType::RegisterFailed => "register_failed",
            AuditEventType::Logout => "logout",
            AuditEventType::RefreshToken => "refresh_token",
            AuditEventType::RefreshTokenFailed => "refresh_token_failed",
            AuditEventType::ChangePassword => "change_password",
            AuditEventType::ChangePasswordFailed => "change_password_failed",
            AuditEventType::RevokeSession => "revoke_session",
            AuditEventType::UpdateUser => "update_user",
            AuditEventType::AccessDenied => "access_denied",
        }
    }
}

// Serde converter for chrono::DateTime <-> mongodb::bson::DateTime
mod bson_datetime_as_chrono {
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
