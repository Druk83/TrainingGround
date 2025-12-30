use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

use super::user::bson_datetime_as_chrono;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationTemplate {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub teacher_id: ObjectId,
    pub name: String,
    pub subject: String,
    pub body: String,
    #[serde(rename = "createdAt", with = "bson_datetime_as_chrono")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt", with = "bson_datetime_as_chrono")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentNotification {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub teacher_id: ObjectId,
    pub template_id: ObjectId,
    pub recipients: Vec<ObjectId>,
    pub subject: String,
    pub body: String,
    #[serde(rename = "sentAt", with = "bson_datetime_as_chrono")]
    pub sent_at: DateTime<Utc>,
    pub status: String,
}
