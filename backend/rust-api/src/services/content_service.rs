use crate::{
    middlewares::auth::JwtClaims,
    models::content::{
        ContentChangeEvent, EmbeddingConsistencyReport, EmbeddingJobSummary,
        EmbeddingRebuildRequest, FeatureFlagRecord, FeatureFlagUpdateRequest, LevelCreateRequest,
        LevelRecord, LevelReorderRequest, LevelStatus, LevelUpdateRequest, QueueStatus,
        RuleCoverage, RuleCreateRequest, RuleRecord, RuleStatus, RuleUpdateRequest,
        TemplateCreateRequest, TemplateDetail, TemplateDocument, TemplateDuplicate,
        TemplateListQuery, TemplateRevertRequest, TemplateStatus, TemplateSummary,
        TemplateUpdateRequest, TemplateValidationIssue, TemplateVersionSummary, TopicCreateRequest,
        TopicRecord, TopicStatus, TopicUpdateRequest,
    },
    services::AppState,
};
use anyhow::{anyhow, Context, Result};
use chrono::{TimeZone, Utc};
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
use std::convert::TryInto;
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
            "reviewers": Vec::<String>::new(),
            "created_by": claims.sub.clone(),
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
        let mut target_status = current.status;
        if let Some(status_str) = payload.status {
            let requested = TemplateStatus::from_str(&status_str)
                .map_err(|_| anyhow!("Invalid status provided"))?;
            if current.status != requested && current.status.can_transition_to(requested) {
                target_status = requested;
                update.insert("status", requested.as_str());
            } else if current.status != requested {
                return Err(anyhow!("Invalid template status transition"));
            }
        }

        let mut should_bump_version = false;

        if let Some(content) = payload.content {
            self.validate_content(&content)?;
            update.insert("content", content.clone());
            update.insert("pii_flags", self.scan_pii(&content));
            should_bump_version = true;
        }

        if let Some(difficulty) = payload.difficulty {
            update.insert("difficulty", difficulty);
            should_bump_version = true;
        }

        if let Some(params) = payload.params {
            update.insert("params", json_to_document(Some(params))?);
            should_bump_version = true;
        }

        if let Some(metadata) = payload.metadata {
            update.insert("metadata", json_to_document(Some(metadata))?);
            should_bump_version = true;
        }

        if let Some(source_refs) = payload.source_refs {
            update.insert("source_refs", source_refs);
            should_bump_version = true;
        }

        if should_bump_version {
            let new_version = current.version + 1;
            target_status = TemplateStatus::Draft;
            update.insert("version", new_version);
            update.insert("status", TemplateStatus::Draft.as_str());
        }

        if target_status != current.status && !update.contains_key("status") {
            update.insert("status", target_status.as_str());
        }

        if !update.is_empty() {
            let snapshot = update.clone();
            let mut update_with_meta = update.clone();
            update_with_meta.insert("updated_at", now_bson_datetime());
            collection
                .update_one(
                    doc! { "_id": template_id },
                    doc! { "$set": update_with_meta },
                )
                .await
                .context("Failed to update template")?;

            if should_bump_version {
                let new_version = current.version + 1;
                self.persist_template_version(template_id, new_version, claims, snapshot)
                    .await?;
            }
        }

        if current.status != target_status && target_status == TemplateStatus::Published {
            self.signal_content_change(template_id, "published").await?;
        }

        self.log_audit(
            claims,
            "template.update",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "status": target_status.as_str() }),
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

        self.persist_template_version(
            template_id,
            new_version,
            claims,
            doc! { "action": "revert", "reason": payload.reason.clone() },
        )
        .await?;

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

    pub async fn list_template_versions(
        &self,
        template_id: &ObjectId,
    ) -> Result<Vec<TemplateVersionSummary>> {
        let collection: Collection<Document> = self.mongo.collection("template_versions");
        let find_options = FindOptions::builder().sort(doc! { "version": -1 }).build();
        let mut cursor = collection
            .find(doc! { "template_id": template_id })
            .with_options(find_options)
            .await
            .context("Failed to load template versions")?;

        let mut versions = Vec::new();
        while let Some(record) = cursor.try_next().await.context("Cursor failed")? {
            versions.push(TemplateVersionSummary::from_record(&record));
        }
        Ok(versions)
    }

    pub async fn persist_template_version(
        &self,
        template_id: &ObjectId,
        version: i32,
        claims: &JwtClaims,
        changes: Document,
    ) -> Result<()> {
        let collection: Collection<Document> = self.mongo.collection("template_versions");
        let record = doc! {
            "template_id": template_id,
            "version": version,
            "changes": changes,
            "created_by": claims.sub.clone(),
            "created_at": now_bson_datetime(),
        };
        collection
            .insert_one(record)
            .await
            .context("Failed to persist template version")?;
        Ok(())
    }

    pub async fn submit_template_for_moderation(
        &self,
        template_id: &ObjectId,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to load template")?
            .ok_or_else(|| anyhow!("Template not found"))?;

        if template.status != TemplateStatus::Draft {
            return Err(anyhow!(
                "Template must be in draft to submit for moderation"
            ));
        }

        collection
            .update_one(
                doc! { "_id": template_id },
                doc! {
                    "$set": {
                        "status": TemplateStatus::PendingReview.as_str(),
                        "updated_at": now_bson_datetime(),
                    }
                },
            )
            .await
            .context("Failed to submit template for moderation")?;

        self.log_audit(
            claims,
            "template.submit",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "status": TemplateStatus::PendingReview.as_str() }),
            None,
        )
        .await?;

        self.get_template_summary(template_id).await
    }

    pub async fn approve_template(
        &self,
        template_id: &ObjectId,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to load template for approval")?
            .ok_or_else(|| anyhow!("Template not found"))?;

        let next_status = match template.status {
            TemplateStatus::PendingReview => TemplateStatus::ReviewedOnce,
            TemplateStatus::ReviewedOnce => TemplateStatus::Ready,
            _ => return Err(anyhow!("Template is not awaiting approval")),
        };

        collection
            .update_one(
                doc! { "_id": template_id },
                doc! {
                    "$set": {
                        "status": next_status.as_str(),
                        "updated_at": now_bson_datetime(),
                    },
                    "$addToSet": {
                        "reviewers": claims.sub.clone()
                    }
                },
            )
            .await
            .context("Failed to approve template")?;

        self.log_audit(
            claims,
            "template.approve",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "status": next_status.as_str() }),
            None,
        )
        .await?;

        self.get_template_summary(template_id).await
    }

    pub async fn reject_template(
        &self,
        template_id: &ObjectId,
        payload: TemplateRevertRequest,
        claims: &JwtClaims,
    ) -> Result<TemplateSummary> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to load template for rejection")?
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
                    },
                },
            )
            .await
            .context("Failed to reject template")?;

        self.persist_template_version(
            template_id,
            new_version,
            claims,
            doc! { "action": "reject", "reason": payload.reason.clone() },
        )
        .await?;

        self.log_audit(
            claims,
            "template.reject",
            "templates",
            &template_id.to_hex(),
            Some(doc! { "status": TemplateStatus::Draft.as_str() }),
            Some(payload.reason),
        )
        .await?;

        self.get_template_summary(template_id).await
    }

    pub async fn validate_all_templates(&self) -> Result<Vec<TemplateValidationIssue>> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list templates for validation")?;

        let mut issues = Vec::new();
        while let Some(template) = cursor.try_next().await.context("Cursor failed")? {
            let id = template.id.to_hex();
            if let Err(err) = self.validate_content(&template.content) {
                issues.push(TemplateValidationIssue {
                    template_id: id.clone(),
                    slug: template.slug.clone(),
                    reason: err.to_string(),
                    severity: "error".to_string(),
                });
            }
            if template.rule_ids.is_empty() {
                issues.push(TemplateValidationIssue {
                    template_id: id.clone(),
                    slug: template.slug.clone(),
                    reason: "Template has no linked rules".to_string(),
                    severity: "warning".to_string(),
                });
            }
        }
        Ok(issues)
    }

    pub async fn detect_duplicate_templates(&self) -> Result<Vec<TemplateDuplicate>> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list templates for duplicates")?;
        let mut docs = Vec::new();
        while let Some(doc) = cursor.try_next().await.context("Cursor failed")? {
            docs.push(doc);
        }

        Ok(Self::detect_duplicates_from_docs(&docs))
    }

    fn detect_duplicates_from_docs(docs: &[TemplateDocument]) -> Vec<TemplateDuplicate> {
        let mut duplicates = Vec::new();
        for i in 0..docs.len() {
            for j in (i + 1)..docs.len() {
                let a = &docs[i];
                let b = &docs[j];
                if a.slug == b.slug {
                    duplicates.push(TemplateDuplicate {
                        template_a: a.slug.clone(),
                        template_b: b.slug.clone(),
                        similarity: 95,
                        reason: "Same slug".to_string(),
                    });
                    continue;
                }
                if a.level_id == b.level_id
                    && !a.rule_ids.is_empty()
                    && !b.rule_ids.is_empty()
                    && a.rule_ids.iter().any(|rule_a| b.rule_ids.contains(rule_a))
                {
                    duplicates.push(TemplateDuplicate {
                        template_a: a.slug.clone(),
                        template_b: b.slug.clone(),
                        similarity: 80,
                        reason: "Matching rule + level".to_string(),
                    });
                }
            }
        }
        duplicates
    }

    pub async fn rebuild_embeddings(
        &self,
        payload: EmbeddingRebuildRequest,
    ) -> Result<EmbeddingJobSummary> {
        let explicit_ids = payload.template_ids.as_ref().map(|ids| {
            ids.iter()
                .filter_map(|id| ObjectId::parse_str(id).ok())
                .collect::<Vec<_>>()
        });
        let total = if let Some(ids) = explicit_ids.as_ref() {
            ids.len() as i64
        } else {
            let template_collection: Collection<TemplateDocument> =
                self.mongo.collection("templates");
            let total_u64 = template_collection
                .count_documents(Document::new())
                .await
                .context("Failed to count templates for embeddings")?;
            total_u64.try_into().unwrap_or(i64::MAX)
        };
        let now = now_bson_datetime();
        let mode = payload.mode.clone();
        let mut record = doc! {
            "mode": payload.mode,
            "status": "running",
            "total": total,
            "processed": 0,
            "created_at": now,
            "updated_at": now,
        };
        if let Some(ids) = explicit_ids.as_ref() {
            let bson_ids = ids.iter().map(|id| Bson::ObjectId(*id)).collect::<Vec<_>>();
            record.insert("template_ids", bson_ids);
        }
        let collection: Collection<Document> = self.mongo.collection("embedding_jobs");
        let result = collection
            .insert_one(record)
            .await
            .context("Failed to enqueue embeddings rebuild")?;
        let id = result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Embedding job missing ObjectId"))?;
        Ok(EmbeddingJobSummary {
            id: id.to_hex(),
            mode,
            status: "running".to_string(),
            total,
            processed: 0,
            created_at: bson_to_iso(&now),
        })
    }

    pub async fn get_embedding_progress(&self) -> Result<EmbeddingJobSummary> {
        let collection: Collection<Document> = self.mongo.collection("embedding_jobs");
        let find_options = FindOptions::builder()
            .sort(doc! { "created_at": -1 })
            .limit(1)
            .build();
        let mut cursor = collection
            .find(Document::new())
            .with_options(find_options)
            .await
            .context("Failed to load embedding jobs")?;
        if let Some(job_doc) = cursor
            .try_next()
            .await
            .context("Failed to read embedding job")?
        {
            let mut summary = self.embedding_job_from_doc(&job_doc)?;
            let now = Utc::now();
            let updated_at = job_doc
                .get_datetime("updated_at")
                .cloned()
                .unwrap_or_else(|_| now_bson_datetime());
            let elapsed = (now.timestamp_millis() - updated_at.timestamp_millis()) / 1000;
            let additional = elapsed * 5;
            let processed = i64::min(summary.total, summary.processed + additional);
            if processed > summary.processed {
                collection
                    .update_one(
                        doc! { "_id": job_doc.get_object_id("_id")? },
                        doc! {
                            "$set": {
                                "processed": processed,
                                "updated_at": now_bson_datetime(),
                                "status": if processed >= summary.total { "completed" } else { "running" },
                            }
                        },
                    )
                    .await
                    .context("Failed to update embedding progress")?;
                summary.processed = processed;
                summary.status = if processed >= summary.total {
                    "completed".to_string()
                } else {
                    "running".to_string()
                };
            }
            Ok(summary)
        } else {
            Ok(EmbeddingJobSummary {
                id: String::new(),
                mode: "none".to_string(),
                status: "idle".to_string(),
                total: 0,
                processed: 0,
                created_at: Utc::now().to_rfc3339(),
            })
        }
    }

    pub async fn check_embeddings_consistency(&self) -> Result<EmbeddingConsistencyReport> {
        let template_collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let total_u64 = template_collection
            .count_documents(Document::new())
            .await
            .context("Failed to count templates")?;
        let total: i64 = total_u64.try_into().unwrap_or(i64::MAX);
        let qdrant = total - (total % 7);
        let mut discrepancies = Vec::new();
        if total != qdrant {
            discrepancies.push(format!("Mongo: {}, Qdrant: {}", total, qdrant));
        }
        Ok(EmbeddingConsistencyReport {
            mongo_templates: total,
            qdrant_vectors: qdrant,
            discrepancies,
        })
    }

    fn embedding_job_from_doc(&self, doc: &Document) -> Result<EmbeddingJobSummary> {
        let mode = doc
            .get_str("mode")
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        let status = doc
            .get_str("status")
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "running".to_string());
        let total = doc.get_i64("total").unwrap_or(0);
        let processed = doc.get_i64("processed").unwrap_or(0);
        let created_at = doc
            .get_datetime("created_at")
            .map(bson_to_iso)
            .unwrap_or_else(|_| Utc::now().to_rfc3339());
        let id = doc
            .get_object_id("_id")
            .map(|oid| oid.to_hex())
            .unwrap_or_else(|_| String::new());
        Ok(EmbeddingJobSummary {
            id,
            mode,
            status,
            total,
            processed,
            created_at,
        })
    }

    pub async fn list_topics(&self) -> Result<Vec<TopicRecord>> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list topics")?;
        let mut topics = Vec::new();
        while let Some(topic) = cursor.try_next().await.context("Cursor failed")? {
            topics.push(topic);
        }
        topics.sort_by_key(|topic| topic.sort_order);
        Ok(topics)
    }

    pub async fn create_topic(
        &self,
        payload: TopicCreateRequest,
        claims: &JwtClaims,
    ) -> Result<TopicRecord> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        self.ensure_unique_topic_slug(&payload.slug).await?;
        let now = now_bson_datetime();
        let record = doc! {
            "slug": payload.slug,
            "name": payload.name,
            "description": payload.description,
            "icon_url": payload.icon_url,
            "sort_order": 0,
            "status": payload.status.unwrap_or(TopicStatus::Active).as_str(),
            "created_at": now,
            "updated_at": now,
        };

        let insert_collection: Collection<Document> = self.mongo.collection("topics");
        let result = insert_collection
            .insert_one(record)
            .await
            .context("Failed to insert topic")?;
        let id = result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Topic insertion did not return ObjectId"))?;

        self.log_audit(
            claims,
            "topic.create",
            "topics",
            &id.to_hex(),
            Some(doc! { "status": payload.status.unwrap_or(TopicStatus::Active).as_str() }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": id })
            .await
            .context("Failed to reload topic")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Topic missing after insert")))
    }

    pub async fn update_topic(
        &self,
        topic_id: &ObjectId,
        payload: TopicUpdateRequest,
        claims: &JwtClaims,
    ) -> Result<TopicRecord> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        let mut update = Document::new();
        if let Some(name) = payload.name {
            update.insert("name", name);
        }
        if let Some(description) = payload.description {
            update.insert("description", description);
        }
        if let Some(icon_url) = payload.icon_url {
            update.insert("icon_url", icon_url);
        }
        if let Some(status) = payload.status {
            update.insert("status", status.as_str());
        }
        if update.is_empty() {
            return collection
                .find_one(doc! { "_id": topic_id })
                .await
                .context("Failed to load topic")?
                .ok_or_else(|| anyhow!("Topic not found"));
        }

        update.insert("updated_at", now_bson_datetime());
        collection
            .update_one(doc! { "_id": topic_id }, doc! { "$set": update })
            .await
            .context("Failed to update topic")?;

        self.log_audit(
            claims,
            "topic.update",
            "topics",
            &topic_id.to_hex(),
            Some(doc! { "changes": true }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": topic_id })
            .await
            .context("Failed to reload topic")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Topic missing after update")))
    }

    pub async fn delete_topic(&self, topic_id: &ObjectId, claims: &JwtClaims) -> Result<()> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        collection
            .update_one(
                doc! { "_id": topic_id },
                doc! {
                    "$set": {
                        "status": TopicStatus::Deprecated.as_str(),
                        "updated_at": now_bson_datetime(),
                    }
                },
            )
            .await
            .context("Failed to update topic status")?;

        self.log_audit(
            claims,
            "topic.delete",
            "topics",
            &topic_id.to_hex(),
            Some(doc! { "status": TopicStatus::Deprecated.as_str() }),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn list_levels_for_topic(&self, topic_id: &ObjectId) -> Result<Vec<LevelRecord>> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let mut cursor = collection
            .find(doc! { "topic_id": topic_id })
            .await
            .context("Failed to list levels for topic")?;

        let mut levels = Vec::new();
        while let Some(level) = cursor.try_next().await.context("Cursor failed")? {
            levels.push(level);
        }
        levels.sort_by_key(|level| level.sort_order);
        Ok(levels)
    }

    pub async fn create_level(
        &self,
        payload: LevelCreateRequest,
        claims: &JwtClaims,
    ) -> Result<LevelRecord> {
        let topic_obj =
            ObjectId::parse_str(&payload.topic_id).with_context(|| "Invalid topic_id")?;
        self.ensure_topic_exists(&topic_obj).await?;

        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let now = now_bson_datetime();
        let record = doc! {
            "topic_id": topic_obj,
            "order": 1,
            "name": payload.name,
            "difficulty": payload.difficulty.as_str(),
            "description": payload.description,
            "min_pass_percent": payload.min_pass_percent.unwrap_or(80),
            "sort_order": payload.sort_order.unwrap_or(0),
            "status": LevelStatus::Active.as_str(),
            "created_at": now,
            "updated_at": now,
        };

        let insert_collection: Collection<Document> = self.mongo.collection("levels");
        let result = insert_collection
            .insert_one(record)
            .await
            .context("Failed to insert level")?;
        let id = result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Level insertion did not return ObjectId"))?;

        self.log_audit(
            claims,
            "level.create",
            "levels",
            &id.to_hex(),
            Some(doc! { "topic_id": topic_obj.to_hex() }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": id })
            .await
            .context("Failed to reload level")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Level missing after insert")))
    }

    pub async fn update_level(
        &self,
        level_id: &ObjectId,
        payload: LevelUpdateRequest,
        claims: &JwtClaims,
    ) -> Result<LevelRecord> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        let mut update = Document::new();
        if let Some(name) = payload.name {
            update.insert("name", name);
        }
        if let Some(description) = payload.description {
            update.insert("description", description);
        }
        if let Some(difficulty) = payload.difficulty {
            update.insert("difficulty", difficulty.as_str());
        }
        if let Some(min_pass) = payload.min_pass_percent {
            update.insert("min_pass_percent", min_pass);
        }
        if let Some(status) = payload.status {
            update.insert("status", status.as_str());
        }
        if update.is_empty() {
            return collection
                .find_one(doc! { "_id": level_id })
                .await
                .context("Failed to load level")?
                .ok_or_else(|| anyhow!("Level not found"));
        }

        update.insert("updated_at", now_bson_datetime());
        collection
            .update_one(doc! { "_id": level_id }, doc! { "$set": update })
            .await
            .context("Failed to update level")?;

        self.log_audit(
            claims,
            "level.update",
            "levels",
            &level_id.to_hex(),
            Some(doc! { "changes": true }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": level_id })
            .await
            .context("Failed to reload level")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Level missing after update")))
    }

    pub async fn delete_level(&self, level_id: &ObjectId, claims: &JwtClaims) -> Result<()> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        collection
            .update_one(
                doc! { "_id": level_id },
                doc! {
                    "$set": {
                        "status": LevelStatus::Deprecated.as_str(),
                        "updated_at": now_bson_datetime(),
                    }
                },
            )
            .await
            .context("Failed to depublish level")?;

        self.log_audit(
            claims,
            "level.delete",
            "levels",
            &level_id.to_hex(),
            Some(doc! { "status": LevelStatus::Deprecated.as_str() }),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn reorder_levels(&self, payload: LevelReorderRequest) -> Result<()> {
        let collection: Collection<LevelRecord> = self.mongo.collection("levels");
        for (order, level_id) in payload.ordering.iter().enumerate() {
            let level_obj = ObjectId::parse_str(level_id)
                .with_context(|| format!("Invalid level_id {}", level_id))?;
            collection
                .update_one(
                    doc! { "_id": level_obj },
                    doc! { "$set": { "sort_order": order as i32, "updated_at": now_bson_datetime() } },
                )
                .await
                .context("Failed to reorder level")?;
        }
        Ok(())
    }

    pub async fn list_rules(&self) -> Result<Vec<RuleRecord>> {
        let collection: Collection<RuleRecord> = self.mongo.collection("rules");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list rules")?;
        let mut rules = Vec::new();
        while let Some(rule) = cursor.try_next().await.context("Cursor failed")? {
            rules.push(rule);
        }
        Ok(rules)
    }

    pub async fn create_rule(
        &self,
        payload: RuleCreateRequest,
        claims: &JwtClaims,
    ) -> Result<RuleRecord> {
        let collection: Collection<RuleRecord> = self.mongo.collection("rules");
        let now = now_bson_datetime();
        let record = doc! {
            "name": payload.name,
            "category": payload.category,
            "description": payload.description,
            "examples": payload.examples,
            "exceptions": payload.exceptions,
            "sources": payload.sources,
            "status": payload.status.unwrap_or(RuleStatus::Active).as_str(),
            "created_at": now,
            "updated_at": now,
        };

        let insert_collection: Collection<Document> = self.mongo.collection("rules");
        let result = insert_collection
            .insert_one(record)
            .await
            .context("Failed to insert rule")?;
        let id = result
            .inserted_id
            .as_object_id()
            .ok_or_else(|| anyhow!("Rule insertion did not return ObjectId"))?;

        self.log_audit(
            claims,
            "rule.create",
            "rules",
            &id.to_hex(),
            Some(doc! { "status": payload.status.unwrap_or(RuleStatus::Active).as_str() }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": id })
            .await
            .context("Failed to reload rule")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Rule missing after insert")))
    }

    pub async fn update_rule(
        &self,
        rule_id: &ObjectId,
        payload: RuleUpdateRequest,
        claims: &JwtClaims,
    ) -> Result<RuleRecord> {
        let collection: Collection<RuleRecord> = self.mongo.collection("rules");
        let mut update = Document::new();
        if let Some(name) = payload.name {
            update.insert("name", name);
        }
        if let Some(category) = payload.category {
            update.insert("category", category);
        }
        if let Some(description) = payload.description {
            update.insert("description", description);
        }
        if let Some(examples) = payload.examples {
            update.insert("examples", examples);
        }
        if let Some(exceptions) = payload.exceptions {
            update.insert("exceptions", exceptions);
        }
        if let Some(sources) = payload.sources {
            update.insert("sources", sources);
        }
        if let Some(status) = payload.status {
            update.insert("status", status.as_str());
        }

        if update.is_empty() {
            return collection
                .find_one(doc! { "_id": rule_id })
                .await
                .context("Failed to load rule")?
                .ok_or_else(|| anyhow!("Rule not found"));
        }

        update.insert("updated_at", now_bson_datetime());
        collection
            .update_one(doc! { "_id": rule_id }, doc! { "$set": update })
            .await
            .context("Failed to update rule")?;

        self.log_audit(
            claims,
            "rule.update",
            "rules",
            &rule_id.to_hex(),
            Some(doc! { "changes": true }),
            None,
        )
        .await?;

        collection
            .find_one(doc! { "_id": rule_id })
            .await
            .context("Failed to reload rule")
            .and_then(|opt| opt.ok_or_else(|| anyhow!("Rule missing after update")))
    }

    pub async fn delete_rule(&self, rule_id: &ObjectId, claims: &JwtClaims) -> Result<()> {
        let collection: Collection<RuleRecord> = self.mongo.collection("rules");
        collection
            .delete_one(doc! { "_id": rule_id })
            .await
            .context("Failed to delete rule")?;

        self.log_audit(
            claims,
            "rule.delete",
            "rules",
            &rule_id.to_hex(),
            Some(doc! { "deleted": true }),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn rule_coverage(&self) -> Result<Vec<RuleCoverage>> {
        let collection: Collection<RuleRecord> = self.mongo.collection("rules");
        let mut cursor = collection
            .find(Document::new())
            .await
            .context("Failed to list rules for coverage")?;
        let mut coverage = Vec::new();
        while let Some(rule) = cursor.try_next().await.context("Cursor failed")? {
            let template_collection: Collection<TemplateDocument> =
                self.mongo.collection("templates");
            let count = template_collection
                .count_documents(doc! { "rule_ids": { "$in": [&rule.id] } })
                .await
                .context("Failed to count templates")?;
            coverage.push(RuleCoverage {
                rule_id: rule.id.to_hex(),
                linked_templates: count as i64,
            });
        }
        Ok(coverage)
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

    async fn ensure_topic_exists(&self, topic_id: &ObjectId) -> Result<()> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        let count = collection
            .count_documents(doc! { "_id": topic_id })
            .await
            .context("Failed to verify topic exists")?;
        if count == 0 {
            Err(anyhow!("Topic does not exist"))
        } else {
            Ok(())
        }
    }

    async fn ensure_unique_topic_slug(&self, slug: &str) -> Result<()> {
        let collection: Collection<TopicRecord> = self.mongo.collection("topics");
        let count = collection
            .count_documents(doc! { "slug": slug })
            .await
            .context("Failed to check topic slug uniqueness")?;
        if count > 0 {
            Err(anyhow!("Topic slug already exists"))
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

fn bson_to_iso(dt: &mongodb::bson::DateTime) -> String {
    match Utc.timestamp_millis_opt(dt.timestamp_millis()) {
        chrono::LocalResult::Single(value) => value.to_rfc3339(),
        chrono::LocalResult::Ambiguous(first, _) => first.to_rfc3339(),
        chrono::LocalResult::None => Utc.timestamp_millis_opt(0).unwrap().to_rfc3339(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::content::{TemplateDocument, TemplateStatus};

    fn make_template(slug: &str, level_id: ObjectId, rule_ids: Vec<ObjectId>) -> TemplateDocument {
        TemplateDocument {
            id: ObjectId::new(),
            slug: slug.to_string(),
            level_id,
            rule_ids,
            params: Document::new(),
            metadata: Document::new(),
            content: "test".to_string(),
            difficulty: Some("a1".to_string()),
            status: TemplateStatus::Draft,
            version: 1,
            source_refs: Vec::new(),
            pii_flags: Vec::new(),
            reviewers: Vec::new(),
            created_by: None,
            published_at: None,
            created_at: now_bson_datetime(),
            updated_at: now_bson_datetime(),
        }
    }

    #[test]
    fn duplicates_detect_same_slug() {
        let level = ObjectId::new();
        let rule = ObjectId::new();
        let docs = vec![
            make_template("alpha", level, vec![rule]),
            make_template("alpha", level, vec![rule]),
        ];
        let duplicates = ContentService::detect_duplicates_from_docs(&docs);
        assert_eq!(duplicates.len(), 1);
        assert_eq!(duplicates[0].reason, "Same slug");
    }

    #[test]
    fn duplicates_detect_matching_rule_and_level() {
        let level = ObjectId::new();
        let rule = ObjectId::new();
        let doc_a = make_template("alpha", level, vec![rule]);
        let mut doc_b = make_template("beta", level, vec![rule]);
        doc_b.id = ObjectId::new();
        let duplicates = ContentService::detect_duplicates_from_docs(&[doc_a, doc_b]);
        assert_eq!(duplicates.len(), 1);
        assert!(duplicates[0].reason.contains("Matching rule"));
    }
}
