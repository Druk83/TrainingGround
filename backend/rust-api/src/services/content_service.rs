use crate::{
    middlewares::auth::JwtClaims,
    models::content::{
        ContentChangeEvent, FeatureFlagRecord, FeatureFlagUpdateRequest, LevelRecord, QueueStatus,
        TemplateCreateRequest, TemplateDetail, TemplateDocument, TemplateListQuery,
        TemplateRevertRequest, TemplateStatus, TemplateSummary, TemplateUpdateRequest, TopicRecord,
    },
    services::AppState,
};
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use futures::TryStreamExt;
use lazy_static::lazy_static;
use mongodb::{
    bson::{doc, oid::ObjectId, to_bson, Bson, Document},
    options::FindOptions,
    Collection, Database,
};
use redis::aio::ConnectionManager;
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;
use std::time::SystemTime;

const MAX_LIST_LIMIT: i64 = 100;
const BLACKLISTED_TERMS: &[&str] = &["xxx", "запрещенное", "наркотик"];

lazy_static! {
    static ref EMAIL_REGEX: Regex =
        Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").unwrap();
    static ref PHONE_REGEX: Regex = Regex::new(r"\b\d{10,}\b").unwrap();
}

pub struct ContentService {
    mongo: Database,
    redis: ConnectionManager,
    stream_name: String,
}

impl ContentService {
    pub fn new(state: &AppState) -> Self {
        Self {
            mongo: state.mongo.clone(),
            redis: state.redis.clone(),
            stream_name: state.config.content.stream_name.clone(),
        }
    }

    pub async fn list_templates(&self, query: TemplateListQuery) -> Result<Vec<TemplateSummary>> {
        let mut filter = Document::new();

        if let Some(status) = query.status {
            let parsed = TemplateStatus::from_str(&status)
                .map_err(|_| anyhow!("Invalid status filter: {}", status))?;
            filter.insert("status", parsed.as_str());
        }

        if let Some(difficulty) = query.difficulty {
            filter.insert("difficulty", difficulty);
        }

        if let Some(version) = query.version {
            filter.insert("version", version);
        }

        if let Some(q) = query.q {
            let regex = Regex::new(&format!("(?i){}", regex::escape(&q))).unwrap_or_else(|_| {
                Regex::new(".*") // fallback, should never fail
                    .expect("hardcoded regex should compile")
            });
            filter.insert(
                "$or",
                vec![
                    doc! { "slug": { "$regex": regex.as_str() } },
                    doc! { "metadata.title": { "$regex": regex.as_str() } },
                ],
            );
        }

        let mut level_filter_ids: Option<Vec<ObjectId>> = None;
        if let Some(topic_id) = query.topic_id {
            let topic_obj =
                ObjectId::parse_str(&topic_id).map_err(|_| anyhow!("Invalid topic_id in query"))?;
            let level_ids = self.fetch_level_ids_for_topic(&topic_obj).await?;
            if level_ids.is_empty() {
                return Ok(Vec::new());
            }
            filter.insert("level_id", doc! { "$in": level_ids.clone() });
            level_filter_ids = Some(level_ids);
        }

        if let Some(level_id) = query.level_id {
            let level_obj =
                ObjectId::parse_str(&level_id).map_err(|_| anyhow!("Invalid level_id in query"))?;
            filter.insert("level_id", level_obj);
        }

        let find_options = FindOptions::builder()
            .sort(doc! { "updated_at": -1 })
            .limit(
                query
                    .limit
                    .map(|v| v as i64)
                    .unwrap_or(25)
                    .min(MAX_LIST_LIMIT),
            )
            .build();

        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let cursor = collection
            .find(filter)
            .with_options(find_options)
            .await
            .context("Failed to load templates")?;

        let templates: Vec<TemplateDocument> = cursor
            .try_collect()
            .await
            .context("Failed to collect template documents")?;

        let level_ids: Vec<ObjectId> = level_filter_ids
            .unwrap_or_else(|| templates.iter().map(|t| t.level_id).collect::<Vec<_>>());

        let level_map = self.fetch_levels(&level_ids).await?;
        let topic_ids: Vec<ObjectId> = level_map
            .values()
            .map(|level| level.topic_id)
            .collect::<Vec<_>>();
        let topic_map = self.fetch_topics(&topic_ids).await?;

        let summary = templates
            .iter()
            .map(|template| TemplateSummary::from_doc(template, &level_map, &topic_map))
            .collect();

        Ok(summary)
    }

    pub async fn get_template(&self, template_id: &ObjectId) -> Result<Option<TemplateDetail>> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let doc = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to fetch template")?;

        if let Some(template) = doc {
            let levels = self
                .fetch_levels(std::slice::from_ref(&template.level_id))
                .await?;
            let topics = self
                .fetch_topics(
                    &levels
                        .values()
                        .map(|level| level.topic_id)
                        .collect::<Vec<_>>(),
                )
                .await?;
            Ok(Some(TemplateDetail::from_doc(&template, &levels, &topics)))
        } else {
            Ok(None)
        }
    }

    pub async fn create_template(
        &self,
        payload: TemplateCreateRequest,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let level_obj =
            ObjectId::parse_str(&payload.level_id).context("Invalid level_id in request")?;
        let rule_ids = parse_object_id_list(&payload.rule_ids)?;
        self.ensure_level_exists(&level_obj).await?;
        self.ensure_rules_exist(&rule_ids).await?;
        self.ensure_unique_slug(&payload.slug, &level_obj, None)
            .await?;
        self.validate_content(&payload.content)?;

        let params = json_to_document(Some(payload.params))?;
        let metadata = json_to_document(Some(payload.metadata))?;
        let now = now_bson_datetime();
        let pii_flags = self.scan_pii(&payload.content);

        let template_doc = doc! {
            "slug": payload.slug,
            "level_id": level_obj,
            "rule_ids": rule_ids,
            "params": params,
            "metadata": metadata,
            "content": payload.content,
            "difficulty": payload.difficulty,
            "status": TemplateStatus::Draft.as_str(),
            "version": 1,
            "source_refs": payload.source_refs,
            "pii_flags": pii_flags,
            "created_at": now,
            "updated_at": now,
        };

        let collection: Collection<Document> = self.mongo.collection("templates");
        let result = collection
            .insert_one(template_doc)
            .await
            .context("Failed to insert template")?;

        let id = result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Template insertion did not return ObjectId"))?;

        self.log_audit(
            claims,
            "template.create",
            "templates",
            &id.to_hex(),
            Some(doc! { "status": "draft" }),
            None,
        )
        .await?;

        self.get_template_summary(&id).await
    }

    pub async fn update_template(
        &self,
        template_id: &ObjectId,
        payload: TemplateUpdateRequest,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let current = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to fetch template")?
            .ok_or_else(|| anyhow!("Template not found"))?;

        let mut update = Document::new();
        let mut new_status = current.status;

        if let Some(status_str) = payload.status {
            let requested = TemplateStatus::from_str(&status_str)
                .map_err(|_| anyhow!("Invalid status provided"))?;
            if current.status != requested && current.status.can_transition_to(requested) {
                new_status = requested;
                update.insert("status", requested.as_str());
            } else if current.status != requested {
                return Err(anyhow!("Invalid template status transition"));
            }
        }

        if let Some(content) = payload.content {
            self.validate_content(&content)?;
            update.insert("content", content.clone());
            update.insert("pii_flags", self.scan_pii(&content));
        }

        if let Some(difficulty) = payload.difficulty {
            update.insert("difficulty", difficulty);
        }

        if let Some(params) = payload.params {
            update.insert("params", json_to_document(Some(params))?);
        }

        if let Some(metadata) = payload.metadata {
            update.insert("metadata", json_to_document(Some(metadata))?);
        }

        if let Some(source_refs) = payload.source_refs {
            update.insert("source_refs", source_refs);
        }

        if !update.is_empty() {
            update.insert("updated_at", now_bson_datetime());
            collection
                .update_one(doc! { "_id": template_id }, doc! { "$set": update })
                .await
                .context("Failed to update template")?;
        }

        if current.status != new_status && new_status == TemplateStatus::Published {
            self.signal_content_change(template_id, "published").await?;
        }

        self.log_audit(
            claims,
            "template.update",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "status": new_status.as_str() }),
            None,
        )
        .await?;

        self.get_template_summary(template_id).await
    }

    pub async fn revert_template(
        &self,
        template_id: &ObjectId,
        payload: TemplateRevertRequest,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to load template for revert")?
            .ok_or_else(|| anyhow!("Template not found"))?;

        let new_version = template.version + 1;
        collection
            .update_one(
                doc! { "_id": template_id },
                doc! {
                    "$set": {
                        "status": TemplateStatus::Draft.as_str(),
                        "updated_at": now_bson_datetime(),
                        "version": new_version
                    }
                },
            )
            .await
            .context("Failed to revert template")?;

        self.log_audit(
            claims,
            "template.revert",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "version": new_version }),
            Some(payload.reason),
        )
        .await?;

        self.get_template_summary(template_id).await
    }

    pub async fn list_feature_flags(&self) -> Result<Vec<FeatureFlagRecord>> {
        let collection: Collection<FeatureFlagRecord> = self.mongo.collection("feature_flags");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list feature flags")?;
        let mut flags = Vec::new();
        while let Some(flag) = cursor.try_next().await.context("Cursor failed")? {
            flags.push(flag);
        }
        Ok(flags)
    }

    pub async fn update_feature_flag(
        &self,
        flag_name: &str,
        payload: FeatureFlagUpdateRequest,
        claims: &JwtClaims,
    ) -> Result<FeatureFlagRecord> {
        let collection: Collection<FeatureFlagRecord> = self.mongo.collection("feature_flags");
        let now = now_bson_datetime();
        collection
            .update_one(
                doc! { "flag_name": flag_name },
                doc! {
                    "$set": {
                        "enabled": payload.enabled,
                        "updated_at": now
                    }
                },
            )
            .await
            .context("Failed to update feature flag")?;

        self.log_audit(
            claims,
            "feature_flag.update",
            "feature_flags",
            flag_name,
            Some(doc! { "enabled": payload.enabled }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "flag_name": flag_name })
            .await
            .context("Failed to load updated flag")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Feature flag not found")))
    }

    pub async fn queue_status(&self) -> Result<QueueStatus> {
        let mut conn = self.redis.clone();
        let length: i64 = redis::cmd("XLEN")
            .arg(&self.stream_name)
            .query_async(&mut conn)
            .await
            .context("Failed to query Redis stream length")?;

        let events: Vec<(String, HashMap<String, String>)> = redis::cmd("XREVRANGE")
            .arg(&self.stream_name)
            .arg("+")
            .arg("-")
            .arg("COUNT")
            .arg(1)
            .query_async(&mut conn)
            .await
            .context("Failed to read stream events")?;

        let last_event = events
            .into_iter()
            .next()
            .map(|(id, fields)| ContentChangeEvent {
                id,
                template_id: fields.get("template_id").cloned().unwrap_or_default(),
                action: fields.get("action").cloned().unwrap_or_default(),
                version: fields.get("version").cloned(),
                timestamp: fields.get("timestamp").cloned(),
            });

        Ok(QueueStatus { length, last_event })
    }

    async fn signal_content_change(&self, template_id: &ObjectId, action: &str) -> Result<()> {
        let mut conn = self.redis.clone();
        redis::cmd("XADD")
            .arg(&self.stream_name)
            .arg("*")
            .arg("template_id")
            .arg(template_id.to_hex())
            .arg("action")
            .arg(action)
            .arg("timestamp")
            .arg(Utc::now().timestamp_millis().to_string())
            .query_async::<String>(&mut conn)
            .await
            .context("Failed to publish template change event")?;
        Ok(())
    }

    async fn get_template_summary(&self, id: &ObjectId) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": id })
            .await
            .context("Refresh failed")?
            .ok_or_else(|| anyhow!("Template missing after refresh"))?;

        let level_map = self
            .fetch_levels(std::slice::from_ref(&template.level_id))
            .await?;
        let topic_ids: Vec<ObjectId> = level_map.values().map(|level| level.topic_id).collect();
        let topic_map = self.fetch_topics(&topic_ids).await?;

        Ok(TemplateSummary::from_doc(&template, &level_map, &topic_map))
    }

    async fn fetch_levels(&self, ids: &[ObjectId]) -> Result<HashMap<ObjectId, LevelRecord>> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }

        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let mut cursor = collection
            .find(doc! { "_id": { "$in": ids } })
            .await
            .context("Failed to load levels")?;

        let mut map = HashMap::new();
        while let Some(level) = cursor.try_next().await.context("Cursor failed")? {
            map.insert(level.id, level);
        }
        Ok(map)
    }

    async fn fetch_topics(&self, ids: &[ObjectId]) -> Result<HashMap<ObjectId, TopicRecord>> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }

        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        let mut cursor = collection
            .find(doc! { "_id": { "$in": ids } })
            .await
            .context("Failed to load topics")?;

        let mut map = HashMap::new();
        while let Some(topic) = cursor.try_next().await.context("Cursor failed")? {
            map.insert(topic.id, topic);
        }
        Ok(map)
    }

    async fn fetch_level_ids_for_topic(&self, topic_id: &ObjectId) -> Result<Vec<ObjectId>> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let cursor = collection
            .find(doc! { "topic_id": topic_id })
            .await
            .context("Failed to query levels for topic")?;

        cursor
            .try_fold(Vec::new(), |mut acc, level| async move {
                acc.push(level.id);
                Ok(acc)
            })
            .await
            .map_err(|e| anyhow!("Failed to read level IDs from MongoDB: {}", e))
    }

    async fn ensure_level_exists(&self, level_id: &ObjectId) -> Result<()> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let count = collection
            .count_documents(doc! { "_id": level_id })
            .await
            .context("Failed to verify level exists")?;
        if count == 0 {
            Err(anyhow!("Level does not exist"))
        } else {
            Ok(())
        }
    }

    async fn ensure_rules_exist(&self, rule_ids: &[ObjectId]) -> Result<()> {
        if rule_ids.is_empty() {
            return Err(anyhow!("At least one rule must be linked"));
        }
        let collection: Collection<Document> = self.mongo.collection("rules");
        let count = collection
            .count_documents(doc! { "_id": { "$in": rule_ids } })
            .await
            .context("Failed to validate rule IDs")?;
        if count as usize != rule_ids.len() {
            Err(anyhow!("One or more rule IDs are unknown"))
        } else {
            Ok(())
        }
    }

    async fn ensure_unique_slug(
        &self,
        slug: &str,
        level_id: &ObjectId,
        existing: Option<&ObjectId>,
    ) -> Result<()> {
        let collection: Collection<Document> = self.mongo.collection("templates");
        let mut filter = doc! {
            "slug": slug,
            "level_id": level_id
        };

        if let Some(exclude_id) = existing {
            filter.insert("_id", doc! { "$ne": exclude_id });
        }

        let count = collection
            .count_documents(filter)
            .await
            .context("Failed to check unique slug")?;

        if count > 0 {
            Err(anyhow!("Template slug already exists for this level"))
        } else {
            Ok(())
        }
    }

    fn validate_content(&self, content: &str) -> Result<()> {
        let problems = detect_blacklist(content);
        if !problems.is_empty() {
            return Err(anyhow!("Blacklist violation: {:?}", problems));
        }
        let pii = self.scan_pii(content);
        if !pii.is_empty() {
            return Err(anyhow!("PII detected: {:?}", pii));
        }
        Ok(())
    }

    fn scan_pii(&self, content: &str) -> Vec<String> {
        let mut matches = Vec::new();
        if EMAIL_REGEX.is_match(content) {
            matches.push("email".to_string());
        }
        if PHONE_REGEX.is_match(content) {
            matches.push("phone".to_string());
        }
        matches
    }

    async fn log_audit(
        &self,
        claims: &JwtClaims,
        action: &str,
        target: &str,
        target_id: &str,
        details: Option<Document>,
        reason: Option<String>,
    ) -> Result<()> {
        let collection: Collection<Document> = self.mongo.collection("audit_log");
        let record = doc! {
            "actor_id": claims.sub.clone(),
            "actor_role": claims.role.clone(),
            "action": action,
            "target": target,
            "target_id": target_id,
            "details": details.unwrap_or_default(),
            "reason": reason,
            "created_at": now_bson_datetime(),
        };
        collection
            .insert_one(record)
            .await
            .context("Failed to write audit log")?;
        Ok(())
    }
}

fn json_to_document(value: Option<Value>) -> Result<Document> {
    if let Some(json) = value {
        let bson = to_bson(&json).context("Failed to convert JSON to BSON")?;
        match bson {
            Bson::Document(doc) => Ok(doc),
            other => Ok(doc! { "value": other }),
        }
    } else {
        Ok(Document::new())
    }
}

fn parse_object_id_list(values: &[String]) -> Result<Vec<ObjectId>> {
    values
        .iter()
        .map(|value| {
            ObjectId::parse_str(value).with_context(|| format!("Invalid object id {}", value))
        })
        .collect()
}

fn detect_blacklist(content: &str) -> Vec<String> {
    BLACKLISTED_TERMS
        .iter()
        .filter_map(|word| {
            if content.to_lowercase().contains(word) {
                Some(word.to_string())
            } else {
                None
            }
        })
        .collect()
}

fn now_bson_datetime() -> mongodb::bson::DateTime {
    mongodb::bson::DateTime::from_system_time(SystemTime::now())
}
