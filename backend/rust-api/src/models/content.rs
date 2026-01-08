use chrono::{LocalResult, TimeZone, Utc};
use mongodb::bson::{doc, oid::ObjectId, Document};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, str::FromStr};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TemplateStatus {
    Draft,
    PendingReview,
    ReviewedOnce,
    Ready,
    Published,
    Deprecated,
}

impl TemplateStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TemplateStatus::Draft => "draft",
            TemplateStatus::PendingReview => "pendingreview",
            TemplateStatus::ReviewedOnce => "reviewedonce",
            TemplateStatus::Ready => "ready",
            TemplateStatus::Published => "published",
            TemplateStatus::Deprecated => "deprecated",
        }
    }

    pub fn can_transition_to(&self, next: TemplateStatus) -> bool {
        matches!(
            (self, next),
            (TemplateStatus::Draft, TemplateStatus::PendingReview)
                | (TemplateStatus::PendingReview, TemplateStatus::ReviewedOnce)
                | (TemplateStatus::ReviewedOnce, TemplateStatus::Ready)
                | (TemplateStatus::Ready, TemplateStatus::Published)
                | (TemplateStatus::Published, TemplateStatus::Deprecated)
                | (_, TemplateStatus::Draft)
        )
    }
}

impl FromStr for TemplateStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let normalized = value.to_lowercase().replace('_', "");
        match normalized.as_str() {
            "draft" => Ok(TemplateStatus::Draft),
            "pendingreview" => Ok(TemplateStatus::PendingReview),
            "reviewedonce" => Ok(TemplateStatus::ReviewedOnce),
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
    #[serde(default)]
    pub reviewers: Vec<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub published_at: Option<mongodb::bson::DateTime>,
    #[serde(rename = "createdAt", alias = "created_at")]
    pub created_at: mongodb::bson::DateTime,
    #[serde(rename = "updatedAt", alias = "updated_at")]
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
    pub reviewers: Vec<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

impl TemplateSummary {
    pub fn from_doc(
        doc: &TemplateDocument,
        levels: &HashMap<ObjectId, LevelRecord>,
        topics: &HashMap<ObjectId, TopicRecord>,
    ) -> Self {
        let level_record = levels.get(&doc.level_id);
        let topic = level_record
            .and_then(|level| topics.get(&level.topic_id))
            .map(TopicSummary::from_topic);
        let level = level_record.map(LevelSummary::from_level);

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
            reviewers: doc.reviewers.clone(),
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
    pub reviewers: Vec<String>,
    pub created_by: Option<String>,
    pub published_at: Option<String>,
}

impl TemplateDetail {
    pub fn from_doc(
        doc: &TemplateDocument,
        levels: &HashMap<ObjectId, LevelRecord>,
        topics: &HashMap<ObjectId, TopicRecord>,
    ) -> Self {
        let level_record = levels.get(&doc.level_id);
        let topic = level_record
            .and_then(|level| topics.get(&level.topic_id))
            .map(TopicSummary::from_topic);
        let level = level_record.map(LevelSummary::from_level);

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
            reviewers: doc.reviewers.clone(),
            created_by: doc.created_by.clone(),
            published_at: doc.published_at.as_ref().map(bson_to_iso),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TemplateVersionSummary {
    pub version: i32,
    pub created_at: String,
    pub created_by: Option<String>,
    pub changes: Document,
}

impl TemplateVersionSummary {
    pub fn from_record(doc: &Document) -> Self {
        let created_at = doc
            .get_datetime("created_at")
            .map(bson_to_iso)
            .unwrap_or_else(|_| Utc::now().to_rfc3339());
        Self {
            version: doc.get_i32("version").unwrap_or(0),
            created_at,
            created_by: doc.get_str("created_by").map(|s| s.to_string()).ok(),
            changes: doc.get_document("changes").cloned().unwrap_or_default(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TemplateValidationIssue {
    pub template_id: String,
    pub slug: String,
    pub reason: String,
    pub severity: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TopicStatus {
    Active,
    Deprecated,
}

impl TopicStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TopicStatus::Active => "active",
            TopicStatus::Deprecated => "deprecated",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub sort_order: i32,
    pub status: TopicStatus,
    #[serde(rename = "createdAt", alias = "created_at")]
    pub created_at: mongodb::bson::DateTime,
    #[serde(rename = "updatedAt", alias = "updated_at")]
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Serialize)]
pub struct TopicSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub sort_order: i32,
    pub status: TopicStatus,
}

impl TopicSummary {
    pub fn from_topic(topic: &TopicRecord) -> Self {
        Self {
            id: topic.id.to_hex(),
            slug: topic.slug.clone(),
            name: topic.name.clone(),
            description: topic.description.clone(),
            icon_url: topic.icon_url.clone(),
            sort_order: topic.sort_order,
            status: topic.status,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LevelStatus {
    Active,
    Deprecated,
}

impl LevelStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            LevelStatus::Active => "active",
            LevelStatus::Deprecated => "deprecated",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LevelDifficulty {
    A1,
    A2,
    B1,
    B2,
}

impl LevelDifficulty {
    pub fn as_str(&self) -> &'static str {
        match self {
            LevelDifficulty::A1 => "a1",
            LevelDifficulty::A2 => "a2",
            LevelDifficulty::B1 => "b1",
            LevelDifficulty::B2 => "b2",
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
    pub difficulty: LevelDifficulty,
    pub description: String,
    pub min_pass_percent: i32,
    pub status: LevelStatus,
    #[serde(rename = "createdAt", alias = "created_at")]
    pub created_at: mongodb::bson::DateTime,
    #[serde(rename = "updatedAt", alias = "updated_at")]
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Serialize)]
pub struct LevelSummary {
    pub id: String,
    pub name: String,
    pub difficulty: LevelDifficulty,
    pub order: i32,
    pub status: LevelStatus,
    pub topic_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuleStatus {
    Active,
    Deprecated,
}

impl RuleStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            RuleStatus::Active => "active",
            RuleStatus::Deprecated => "deprecated",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuleRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub slug: String,
    pub name: String,
    pub category: String,
    pub description: String,
    #[serde(default)]
    pub examples: Vec<String>,
    #[serde(default)]
    pub exceptions: Vec<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    pub status: RuleStatus,
    #[serde(rename = "createdAt", alias = "created_at")]
    pub created_at: mongodb::bson::DateTime,
    #[serde(rename = "updatedAt", alias = "updated_at")]
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Serialize)]
pub struct RuleCoverage {
    pub rule_id: String,
    pub linked_templates: i64,
}

#[derive(Debug, Serialize)]
pub struct RuleSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub examples: Vec<String>,
    pub exceptions: Vec<String>,
    pub sources: Vec<String>,
    pub status: String,
}

impl RuleSummary {
    pub fn from_rule(rule: &RuleRecord) -> Self {
        Self {
            id: rule.id.to_hex(),
            slug: rule.slug.clone(),
            name: rule.name.clone(),
            category: rule.category.clone(),
            description: rule.description.clone(),
            examples: rule.examples.clone(),
            exceptions: rule.exceptions.clone(),
            sources: rule.sources.clone(),
            status: rule.status.as_str().to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingJobRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub mode: String,
    pub status: String,
    pub total: i64,
    pub processed: i64,
    pub created_at: mongodb::bson::DateTime,
    pub updated_at: mongodb::bson::DateTime,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingRebuildRequest {
    pub mode: String,
    #[serde(default)]
    pub template_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct EmbeddingJobSummary {
    pub id: String,
    pub mode: String,
    pub status: String,
    pub total: i64,
    pub processed: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct EmbeddingConsistencyReport {
    pub mongo_templates: i64,
    pub qdrant_vectors: i64,
    pub discrepancies: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TemplateDuplicate {
    pub template_a: String,
    pub template_b: String,
    pub similarity: i32,
    pub reason: String,
}

impl LevelSummary {
    pub fn from_level(level: &LevelRecord) -> Self {
        Self {
            id: level.id.to_hex(),
            name: level.name.clone(),
            difficulty: level.difficulty,
            order: level.order,
            status: level.status,
            topic_id: level.topic_id.to_hex(),
        }
    }
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
pub struct TemplateEnrichmentRequest {
    pub count: u32,
    #[serde(default)]
    pub allow_reuse: bool,
    #[serde(default)]
    pub reject_limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum TemplateEnrichmentRunStatus {
    InProgress,
    Completed,
    Failed,
}

impl TemplateEnrichmentRunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TemplateEnrichmentRunStatus::InProgress => "in_progress",
            TemplateEnrichmentRunStatus::Completed => "completed",
            TemplateEnrichmentRunStatus::Failed => "failed",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateEnrichmentRunRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub template_id: ObjectId,
    pub user_id: Option<ObjectId>,
    pub count: u32,
    pub allow_reuse: bool,
    pub reject_limit: Option<u32>,
    pub status: TemplateEnrichmentRunStatus,
    pub success_count: u32,
    pub error_count: u32,
    pub started_at: mongodb::bson::DateTime,
    pub finished_at: Option<mongodb::bson::DateTime>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TemplateEnrichmentRunSummary {
    pub id: String,
    pub template_id: String,
    pub user_id: Option<String>,
    pub count: u32,
    pub allow_reuse: bool,
    pub reject_limit: Option<u32>,
    pub status: TemplateEnrichmentRunStatus,
    pub success_count: u32,
    pub error_count: u32,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateEnrichmentTaskRecord {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub template_id: ObjectId,
    pub run_id: ObjectId,
    pub text: String,
    pub correct_answer: String,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub metadata: Document,
    #[serde(default = "default_task_status")]
    pub status: String,
    pub generated_at: mongodb::bson::DateTime,
    pub generated_by: Option<ObjectId>,
    #[serde(default)]
    pub deleted_at: Option<mongodb::bson::DateTime>,
}

fn default_task_status() -> String {
    "active".to_string()
}

#[derive(Debug, Serialize)]
pub struct TemplateEnrichmentTaskView {
    pub id: String,
    pub template_id: String,
    pub run_id: String,
    pub text: String,
    pub correct_answer: String,
    pub options: Vec<String>,
    pub status: String,
    pub generated_at: String,
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

#[derive(Debug, Deserialize)]
pub struct TopicCreateRequest {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub status: Option<TopicStatus>,
}

#[derive(Debug, Deserialize)]
pub struct TopicUpdateRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub status: Option<TopicStatus>,
}

#[derive(Debug, Deserialize)]
pub struct LevelCreateRequest {
    pub topic_id: String,
    pub name: String,
    pub difficulty: LevelDifficulty,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub min_pass_percent: Option<i32>,
    #[serde(default)]
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct LevelUpdateRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub difficulty: Option<LevelDifficulty>,
    #[serde(default)]
    pub min_pass_percent: Option<i32>,
    #[serde(default)]
    pub status: Option<LevelStatus>,
}

#[derive(Debug, Deserialize)]
pub struct LevelReorderRequest {
    pub ordering: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RuleCreateRequest {
    pub slug: String,
    pub name: String,
    pub category: String,
    pub description: String,
    #[serde(default)]
    pub examples: Vec<String>,
    #[serde(default)]
    pub exceptions: Vec<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub status: Option<RuleStatus>,
}

#[derive(Debug, Deserialize)]
pub struct RuleUpdateRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub examples: Option<Vec<String>>,
    #[serde(default)]
    pub exceptions: Option<Vec<String>>,
    #[serde(default)]
    pub sources: Option<Vec<String>>,
    #[serde(default)]
    pub status: Option<RuleStatus>,
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

#[cfg(test)]
mod tests {
    use super::{
        LevelDifficulty, LevelRecord, RuleRecord, TemplateDocument, TemplateStatus, TopicRecord,
        TopicStatus,
    };
    use mongodb::bson::{doc, oid::ObjectId, DateTime as BsonDateTime};

    #[test]
    fn template_status_transitions() {
        assert!(TemplateStatus::Draft.can_transition_to(TemplateStatus::PendingReview));
        assert!(TemplateStatus::PendingReview.can_transition_to(TemplateStatus::ReviewedOnce));
        assert!(TemplateStatus::ReviewedOnce.can_transition_to(TemplateStatus::Ready));
        assert!(!TemplateStatus::PendingReview.can_transition_to(TemplateStatus::Published));
    }

    #[test]
    fn topic_status_names() {
        assert_eq!(TopicStatus::Active.as_str(), "active");
        assert_eq!(TopicStatus::Deprecated.as_str(), "deprecated");
    }

    #[test]
    fn template_document_accepts_snake_case_timestamps() {
        let template_id = ObjectId::new();
        let level_id = ObjectId::new();
        let now = BsonDateTime::now();
        let doc = doc! {
            "_id": template_id,
            "slug": "demo",
            "level_id": level_id,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        };

        let parsed: TemplateDocument =
            mongodb::bson::from_document(doc).expect("document should deserialize");
        assert_eq!(parsed.slug, "demo");
        assert_eq!(parsed.status, TemplateStatus::Draft);
        assert_eq!(parsed.updated_at, now);
        assert_eq!(parsed.created_at, now);
    }

    #[test]
    fn topic_record_accepts_snake_case_timestamps() {
        let topic_id = ObjectId::new();
        let now = BsonDateTime::now();
        let doc = doc! {
            "_id": topic_id,
            "slug": "test-topic",
            "name": "Test Topic",
            "description": "desc",
            "icon_url": BsonDateTime::now().to_string(),
            "sort_order": 1,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        };

        let parsed: TopicRecord =
            mongodb::bson::from_document(doc).expect("topic should deserialize");
        assert_eq!(parsed.id, topic_id);
        assert_eq!(parsed.created_at, now);
        assert_eq!(parsed.updated_at, now);
    }

    #[test]
    fn level_record_accepts_snake_case_timestamps() {
        let level_id = ObjectId::new();
        let topic_id = ObjectId::new();
        let now = BsonDateTime::now();
        let doc = doc! {
            "_id": level_id,
            "topic_id": topic_id,
            "order": 0,
            "name": "Level",
            "difficulty": "a1",
            "description": "",
            "min_pass_percent": 75,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        };

        let parsed: LevelRecord =
            mongodb::bson::from_document(doc).expect("level should deserialize");
        assert_eq!(parsed.id, level_id);
        assert_eq!(parsed.topic_id, topic_id);
        assert_eq!(parsed.difficulty, LevelDifficulty::A1);
        assert_eq!(parsed.created_at, now);
        assert_eq!(parsed.updated_at, now);
    }

    #[test]
    fn rule_record_accepts_snake_case_timestamps() {
        let rule_id = ObjectId::new();
        let now = BsonDateTime::now();
        let doc = doc! {
            "_id": rule_id,
            "slug": "rule-1",
            "name": "Rule",
            "category": "cat",
            "description": "desc",
            "examples": [],
            "exceptions": [],
            "sources": [],
            "status": "active",
            "created_at": now,
            "updated_at": now,
        };

        let parsed: RuleRecord =
            mongodb::bson::from_document(doc).expect("rule should deserialize");
        assert_eq!(parsed.id, rule_id);
        assert_eq!(parsed.created_at, now);
        assert_eq!(parsed.updated_at, now);
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
