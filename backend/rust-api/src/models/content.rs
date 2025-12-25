use chrono::{LocalResult, TimeZone, Utc};
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, str::FromStr};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TemplateStatus {
    Draft,
    Ready,
    Published,
    Deprecated,
}

impl TemplateStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TemplateStatus::Draft => "draft",
            TemplateStatus::Ready => "ready",
            TemplateStatus::Published => "published",
            TemplateStatus::Deprecated => "deprecated",
        }
    }

    pub fn can_transition_to(&self, next: TemplateStatus) -> bool {
        matches!(
            (self, next),
            (TemplateStatus::Draft, TemplateStatus::Ready)
                | (TemplateStatus::Ready, TemplateStatus::Published)
                | (TemplateStatus::Published, TemplateStatus::Deprecated)
                | (_, TemplateStatus::Draft)
        )
    }
}

impl FromStr for TemplateStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.to_lowercase().as_str() {
            "draft" => Ok(TemplateStatus::Draft),
            "ready" => Ok(TemplateStatus::Ready),
            "published" => Ok(TemplateStatus::Published),
            "deprecated" => Ok(TemplateStatus::Deprecated),
            _ => Err(format!("Invalid template status: {}", value)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateDocument {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub level_id: ObjectId,
    #[serde(default)]
    pub rule_ids: Vec<ObjectId>,
    #[serde(default)]
    pub params: Document,
    #[serde(default)]
    pub metadata: Document,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub difficulty: Option<String>,
    pub status: TemplateStatus,
    #[serde(default)]
    pub version: i32,
    #[serde(default)]
    pub source_refs: Vec<String>,
    #[serde(default)]
    pub pii_flags: Vec<String>,
    pub created_at: mongodb::bson::DateTime,
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Serialize)]
pub struct TemplateSummary {
    pub id: String,
    pub slug: String,
    pub status: TemplateStatus,
    pub version: i32,
    pub difficulty: Option<String>,
    pub level: Option<LevelSummary>,
    pub topic: Option<TopicSummary>,
    pub pii_flags: Vec<String>,
    pub source_refs: Vec<String>,
    pub updated_at: String,
}

impl TemplateSummary {
    pub fn from_doc(
        doc: &TemplateDocument,
        levels: &HashMap<ObjectId, LevelRecord>,
        topics: &HashMap<ObjectId, TopicRecord>,
    ) -> Self {
        let level = levels.get(&doc.level_id).map(LevelSummary::from_level);
        let topic = level
            .as_ref()
            .and_then(|level| topics.get(&level.topic_id))
            .map(TopicSummary::from_topic);

        Self {
            id: doc.id.to_hex(),
            slug: doc.slug.clone(),
            status: doc.status,
            version: doc.version,
            difficulty: doc.difficulty.clone(),
            level,
            topic,
            pii_flags: doc.pii_flags.clone(),
            source_refs: doc.source_refs.clone(),
            updated_at: bson_to_iso(&doc.updated_at),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TemplateDetail {
    pub id: String,
    pub slug: String,
    pub status: TemplateStatus,
    pub version: i32,
    pub difficulty: Option<String>,
    pub params: Document,
    pub metadata: Document,
    pub content: String,
    pub rule_ids: Vec<String>,
    pub source_refs: Vec<String>,
    pub pii_flags: Vec<String>,
    pub level: Option<LevelSummary>,
    pub topic: Option<TopicSummary>,
    pub created_at: String,
    pub updated_at: String,
}

impl TemplateDetail {
    pub fn from_doc(
        doc: &TemplateDocument,
        levels: &HashMap<ObjectId, LevelRecord>,
        topics: &HashMap<ObjectId, TopicRecord>,
    ) -> Self {
        let level = levels.get(&doc.level_id).map(LevelSummary::from_level);
        let topic = level
            .as_ref()
            .and_then(|level| topics.get(&level.topic_id))
            .map(TopicSummary::from_topic);

        Self {
            id: doc.id.to_hex(),
            slug: doc.slug.clone(),
            status: doc.status,
            version: doc.version,
            difficulty: doc.difficulty.clone(),
            params: doc.params.clone(),
            metadata: doc.metadata.clone(),
            content: doc.content.clone(),
            rule_ids: doc
                .rule_ids
                .iter()
                .map(|id| id.to_hex())
                .collect::<Vec<_>>(),
            source_refs: doc.source_refs.clone(),
            pii_flags: doc.pii_flags.clone(),
            level,
            topic,
            created_at: bson_to_iso(&doc.created_at),
            updated_at: bson_to_iso(&doc.updated_at),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct LevelSummary {
    pub id: String,
    pub name: String,
    pub order: i32,
    pub topic_id: ObjectId,
}

impl LevelSummary {
    fn from_level(level: &LevelRecord) -> Self {
        Self {
            id: level.id.to_hex(),
            name: level.name.clone(),
            order: level.order,
            topic_id: level.topic_id,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TopicSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
}

impl TopicSummary {
    fn from_topic(topic: &TopicRecord) -> Self {
        Self {
            id: topic.id.to_hex(),
            slug: topic.slug.clone(),
            name: topic.name.clone(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LevelRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub topic_id: ObjectId,
    pub order: i32,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TopicRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct TemplateListQuery {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub topic_id: Option<String>,
    #[serde(default)]
    pub level_id: Option<String>,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub version: Option<i32>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateCreateRequest {
    pub slug: String,
    pub level_id: String,
    pub rule_ids: Vec<String>,
    #[serde(default)]
    pub params: serde_json::Value,
    #[serde(default)]
    pub metadata: serde_json::Value,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub source_refs: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateUpdateRequest {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub source_refs: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateRevertRequest {
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureFlagRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub flag_name: String,
    pub enabled: bool,
    #[serde(default)]
    pub rollout_percentage: Option<i32>,
    #[serde(default)]
    pub target_groups: Vec<String>,
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Deserialize)]
pub struct FeatureFlagUpdateRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct QueueStatus {
    pub length: i64,
    pub last_event: Option<ContentChangeEvent>,
}

#[derive(Debug, Serialize)]
pub struct ContentChangeEvent {
    pub id: String,
    pub template_id: String,
    pub action: String,
    pub version: Option<String>,
    pub timestamp: Option<String>,
}

fn bson_to_iso(dt: &mongodb::bson::DateTime) -> String {
    match Utc.timestamp_millis_opt(dt.timestamp_millis()) {
        LocalResult::Single(value) => value.to_rfc3339(),
        LocalResult::Ambiguous(first, _) => first.to_rfc3339(),
        LocalResult::None => Utc.timestamp_millis_opt(0).unwrap().to_rfc3339(),
    }
}

#[derive(Debug, Serialize)]
pub struct AuditRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub actor_id: String,
    pub actor_role: String,
    pub action: String,
    pub target: String,
    pub target_id: String,
    pub reason: Option<String>,
    pub details: Document,
    pub created_at: mongodb::bson::DateTime,
}
