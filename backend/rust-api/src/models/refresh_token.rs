use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

// Import serde helpers from user module
use super::user::bson_datetime_as_chrono;

/// Refresh token stored in MongoDB "refresh_tokens" collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshToken {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,

    #[serde(rename = "userId")]
    pub user_id: ObjectId,

    /// SHA-256 hash of the actual refresh token (stored for validation)
    pub token_hash: String,

    #[serde(rename = "createdAt", with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,

    #[serde(rename = "expiresAt", with = "bson_datetime_as_chrono")]
    pub expires_at: DateTime<Utc>,

    #[serde(rename = "lastUsedAt", with = "bson_datetime_as_chrono")]
    pub last_used_at: DateTime<Utc>,

    /// User agent of the client that created this token
    pub user_agent: Option<String>,

    /// IP address of the client that created this token
    pub ip: Option<String>,

    /// Whether this token has been revoked
    #[serde(default)]
    pub revoked: bool,
}

/// Active session information (for user profile page)
#[derive(Debug, Serialize)]
pub struct ActiveSession {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub is_current: bool,
}

impl From<RefreshToken> for ActiveSession {
    fn from(token: RefreshToken) -> Self {
        ActiveSession {
            id: token.id.map(|id| id.to_hex()).unwrap_or_default(),
            created_at: token.created_at,
            last_used_at: token.last_used_at,
            user_agent: token.user_agent,
            ip: token.ip,
            is_current: false, // Will be set by handler based on current token
        }
    }
}

/// Request to refresh access token
#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

/// Response after refreshing access token
#[derive(Debug, Serialize)]
pub struct RefreshTokenResponse {
    pub access_token: String,
}
