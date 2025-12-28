use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use validator::Validate;

use super::user::bson_datetime_as_chrono;

/// Group model stored in MongoDB "groups" collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,

    /// Название группы (класс, параллель)
    pub name: String,

    /// Школа
    pub school: String,

    /// ID куратора (ref: users, роль teacher)
    #[serde(rename = "curatorId", skip_serializing_if = "Option::is_none")]
    pub curator_id: Option<ObjectId>,

    /// Описание (опционально)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    #[serde(rename = "createdAt", with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,

    #[serde(rename = "updatedAt", with = "bson_datetime_as_chrono")]
    pub updated_at: DateTime<Utc>,
}

/// Group response для API (с populated данными)
#[derive(Debug, Serialize)]
pub struct GroupResponse {
    pub id: String,
    pub name: String,
    pub school: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub curator_id: Option<String>,

    /// Имя куратора (populated из users)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Количество учеников в группе
    pub student_count: usize,

    pub created_at: DateTime<Utc>,
}

impl From<Group> for GroupResponse {
    fn from(group: Group) -> Self {
        GroupResponse {
            id: group.id.map(|id| id.to_hex()).unwrap_or_default(),
            name: group.name,
            school: group.school,
            curator_id: group.curator_id.map(|id| id.to_hex()),
            curator_name: None, // будет заполнено в service
            description: group.description,
            student_count: 0, // будет заполнено в service
            created_at: group.created_at,
        }
    }
}

/// Request для создания группы
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct CreateGroupRequest {
    #[validate(length(
        min = 1,
        max = 100,
        message = "Name must be between 1 and 100 characters"
    ))]
    pub name: String,

    #[validate(length(
        min = 1,
        max = 200,
        message = "School must be between 1 and 200 characters"
    ))]
    pub school: String,

    /// ID куратора (ObjectId as string)
    pub curator_id: Option<String>,

    pub description: Option<String>,
}

/// Request для обновления группы
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct UpdateGroupRequest {
    #[validate(length(
        min = 1,
        max = 100,
        message = "Name must be between 1 and 100 characters"
    ))]
    pub name: Option<String>,

    #[validate(length(
        min = 1,
        max = 200,
        message = "School must be between 1 and 200 characters"
    ))]
    pub school: Option<String>,

    /// ID куратора (ObjectId as string)
    pub curator_id: Option<String>,

    pub description: Option<String>,
}

/// Query параметры для списка групп
#[derive(Debug, Deserialize, Clone)]
pub struct ListGroupsQuery {
    /// Фильтр по школе
    pub school: Option<String>,

    /// Поиск по названию (case-insensitive)
    pub search: Option<String>,

    pub limit: Option<u32>,
    pub offset: Option<u32>,
}
