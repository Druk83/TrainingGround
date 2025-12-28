use chrono::{DateTime, Utc};
use mongodb::bson::{oid::ObjectId, Document};
use serde::{Deserialize, Serialize};
use validator::Validate;

/// User model stored in MongoDB "users" collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub email: String,
    pub password_hash: String,
    pub name: String,
    pub role: UserRole,
    #[serde(default)]
    pub group_ids: Vec<String>,
    #[serde(default)]
    pub is_blocked: bool,
    #[serde(rename = "createdAt", with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt", with = "bson_datetime_as_chrono")]
    pub updated_at: DateTime<Utc>,
    #[serde(
        rename = "lastLoginAt",
        default,
        skip_serializing_if = "Option::is_none",
        with = "bson_datetime_as_chrono_option"
    )]
    pub last_login_at: Option<DateTime<Utc>>,
    /// Optional metadata (used by superuser seed)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Document>,

    /// Временная блокировка (до какого времени заблокирован)
    #[serde(
        rename = "blockedUntil",
        default,
        skip_serializing_if = "Option::is_none",
        with = "bson_datetime_as_chrono_option"
    )]
    pub blocked_until: Option<DateTime<Utc>>,

    /// Причина блокировки
    #[serde(
        rename = "blockReason",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub block_reason: Option<String>,
}

// Serde converters for chrono::DateTime <-> mongodb::bson::DateTime
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

pub(super) mod bson_datetime_as_chrono_option {
    use chrono::{DateTime, Utc};
    use mongodb::bson;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &Option<DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match date {
            Some(d) => {
                let bson_dt = bson::DateTime::from_millis(d.timestamp_millis());
                serializer.serialize_some(&bson_dt)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt_bson_dt: Option<bson::DateTime> = Option::deserialize(deserializer)?;
        Ok(opt_bson_dt
            .map(|bson_dt| DateTime::from_timestamp_millis(bson_dt.timestamp_millis()).unwrap()))
    }
}

/// User roles matching requirements/архитектура/описание AL.md
/// - Student: ученик
/// - Teacher: учитель/куратор
/// - ContentAdmin: администратор контента (шаблоны, темы, правила)
/// - Admin: системный администратор (пользователи, группы, настройки)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    #[default]
    Student,
    Teacher,
    #[serde(rename = "content_admin")]
    ContentAdmin,
    Admin,
}

impl UserRole {
    pub fn as_str(&self) -> &str {
        match self {
            UserRole::Student => "student",
            UserRole::Teacher => "teacher",
            UserRole::ContentAdmin => "content_admin",
            UserRole::Admin => "admin",
        }
    }
}

/// User profile returned to client (without sensitive data)
#[derive(Debug, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: UserRole,
    pub group_ids: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

impl From<User> for UserProfile {
    fn from(user: User) -> Self {
        UserProfile {
            id: user.id.map(|id| id.to_hex()).unwrap_or_default(),
            email: user.email,
            name: user.name,
            role: user.role,
            group_ids: user.group_ids,
            created_at: user.created_at,
            last_login_at: user.last_login_at,
        }
    }
}

/// Request to register a new user
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,

    #[validate(length(
        min = 1,
        max = 100,
        message = "Name must be between 1 and 100 characters"
    ))]
    pub name: String,

    /// Optional role (defaults to student). Only admins can create non-student users.
    pub role: Option<UserRole>,

    /// Optional group IDs (for students/teachers)
    pub group_ids: Option<Vec<String>>,
}

/// Request to login
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    pub password: String,

    /// If true, refresh token TTL is extended to 30 days
    #[serde(default)]
    pub remember_me: bool,
}

/// Response after successful login or registration
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: UserProfile,
}

/// Response after successful login or registration (refresh_token in HTTP-only cookie)
#[derive(Debug, Serialize)]
pub struct AuthResponseCookie {
    pub access_token: String,
    pub user: UserProfile,
}

/// Request to change password
#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    pub old_password: String,

    #[validate(length(min = 8, message = "New password must be at least 8 characters"))]
    pub new_password: String,
}

/// Request to update user (admin only)
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub role: Option<UserRole>,
    pub group_ids: Option<Vec<String>>,
    pub is_blocked: Option<bool>,
}

/// Query params for listing users
#[derive(Debug, Deserialize)]
pub struct ListUsersQuery {
    pub role: Option<String>,
    pub group_id: Option<String>,
    pub is_blocked: Option<bool>,
    pub search: Option<String>, // search by email or name
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Request для создания пользователя (Admin)
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,

    #[validate(length(
        min = 1,
        max = 100,
        message = "Name must be between 1 and 100 characters"
    ))]
    pub name: String,

    /// Роль пользователя (Admin может создавать любую роль)
    pub role: UserRole,

    /// Группы
    pub group_ids: Option<Vec<String>>,
}

/// Request для блокировки пользователя
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct BlockUserRequest {
    #[validate(length(min = 1, message = "Reason is required"))]
    pub reason: String,

    /// Длительность блокировки в часах (None = permanent)
    pub duration_hours: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct BulkUserActionRequest {
    pub user_ids: Vec<String>,
    pub operation: BulkUserOperation,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BulkUserOperation {
    Block {
        reason: String,
        duration_hours: Option<u32>,
    },
    Unblock,
    SetGroups {
        group_ids: Vec<String>,
    },
}

#[derive(Debug, Serialize)]
pub struct BulkUserActionResult {
    pub processed: usize,
    pub failed: Vec<BulkUserActionError>,
}

#[derive(Debug, Serialize)]
pub struct BulkUserActionError {
    pub user_id: String,
    pub error: String,
}

/// User detail response для админа (полная информация)
#[derive(Debug, Serialize)]
pub struct UserDetailResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: UserRole,
    pub group_ids: Vec<String>,
    pub is_blocked: bool,
    pub blocked_until: Option<DateTime<Utc>>,
    pub block_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

impl From<User> for UserDetailResponse {
    fn from(user: User) -> Self {
        UserDetailResponse {
            id: user.id.map(|id| id.to_hex()).unwrap_or_default(),
            email: user.email,
            name: user.name,
            role: user.role,
            group_ids: user.group_ids,
            is_blocked: user.is_blocked,
            blocked_until: user.blocked_until,
            block_reason: user.block_reason,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_login_at: user.last_login_at,
        }
    }
}
