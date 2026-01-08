use crate::{
    middlewares::auth::JwtClaims,
    models::content::{
        TemplateDocument, TemplateEnrichmentRequest, TemplateEnrichmentRunRecord,
        TemplateEnrichmentRunStatus, TemplateEnrichmentRunSummary, TemplateEnrichmentTaskRecord,
        TemplateEnrichmentTaskView,
    },
    services::template_generator::{request_instances, GenerateInstancesRequest, TaskInstance},
    services::AppState,
};
use anyhow::{anyhow, Context, Result};
use chrono::{Duration, TimeZone, Utc};
use futures::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId, to_bson, Bson, Document},
    options::FindOptions,
    Collection, Database,
};
use reqwest::Client;

pub struct TemplateEnrichmentService {
    mongo: Database,
    http_client: Client,
    python_api_url: String,
}

impl TemplateEnrichmentService {
    pub fn new(state: &AppState) -> Self {
        Self {
            mongo: state.mongo.clone(),
            http_client: Client::new(),
            python_api_url: state.config.python_api_url.clone(),
        }
    }

    pub async fn start_run(
        &self,
        template_id: &ObjectId,
        claims: &JwtClaims,
        mut request: TemplateEnrichmentRequest,
    ) -> Result<TemplateEnrichmentRunSummary> {
        request.count = request.count.clamp(1, 200);
        let template = self.load_template(template_id).await?;
        self.store_generation_settings(template_id, &request)
            .await?;
        self.enforce_daily_limit(template_id, &request).await?;

        let runs_collection: Collection<TemplateEnrichmentRunRecord> =
            self.mongo.collection("template_enrichment_runs");
        let now = current_time();
        let mut run = TemplateEnrichmentRunRecord {
            id: ObjectId::new(),
            template_id: *template_id,
            user_id: ObjectId::parse_str(&claims.sub).ok(),
            count: request.count,
            allow_reuse: request.allow_reuse,
            reject_limit: request.reject_limit,
            status: TemplateEnrichmentRunStatus::InProgress,
            success_count: 0,
            error_count: 0,
            started_at: now,
            finished_at: None,
            error_message: None,
        };
        let tasks_collection: Collection<TemplateEnrichmentTaskRecord> =
            self.mongo.collection("template_enrichment_tasks");

        runs_collection
            .insert_one(&run)
            .await
            .context("Failed to persist enrichment run")?;

        for _ in 0..request.count {
            match self
                .request_task_instance(&template, request.allow_reuse)
                .await
            {
                Ok(instance) => match self.build_task_record(&template, &run.id, &instance) {
                    Ok(record) => {
                        tasks_collection
                            .insert_one(&record)
                            .await
                            .context("Failed to store enrichment task")?;
                        run.success_count += 1;
                    }
                    Err(err) => {
                        run.error_count += 1;
                        run.error_message = Some(err.to_string());
                        break;
                    }
                },
                Err(err) => {
                    run.error_count += 1;
                    run.error_message = Some(err.to_string());
                    break;
                }
            }
        }

        run.finished_at = Some(current_time());
        run.status = if run.success_count == request.count {
            TemplateEnrichmentRunStatus::Completed
        } else {
            TemplateEnrichmentRunStatus::Failed
        };

        runs_collection
            .update_one(
                doc! { "_id": &run.id },
                doc! {
                    "$set": {
                        "status": run.status.as_str(),
                        "success_count": run.success_count as i64,
                        "error_count": run.error_count as i64,
                        "finished_at": run.finished_at,
                        "error_message": run.error_message.clone(),
                    }
                },
            )
            .await
            .context("Failed to finalize enrichment run")?;

        Ok(self.run_to_summary(&run))
    }

    pub async fn list_runs(
        &self,
        template_id: &ObjectId,
        limit: i64,
    ) -> Result<Vec<TemplateEnrichmentRunSummary>> {
        let runs_collection: Collection<TemplateEnrichmentRunRecord> =
            self.mongo.collection("template_enrichment_runs");
        let options = FindOptions::builder()
            .sort(doc! { "started_at": -1 })
            .limit(limit)
            .build();
        let mut cursor = runs_collection
            .find(doc! { "template_id": template_id })
            .with_options(options)
            .await
            .context("Failed to query enrichment runs")?;

        let mut result = Vec::new();
        while let Some(run) = cursor
            .try_next()
            .await
            .context("Failed to iterate enrichment runs")?
        {
            result.push(self.run_to_summary(&run));
        }
        Ok(result)
    }

    pub async fn list_tasks(
        &self,
        template_id: &ObjectId,
        status: Option<&str>,
        limit: i64,
    ) -> Result<Vec<TemplateEnrichmentTaskView>> {
        let tasks_collection: Collection<TemplateEnrichmentTaskRecord> =
            self.mongo.collection("template_enrichment_tasks");
        let mut filter = doc! { "template_id": template_id };
        if let Some(value) = status {
            filter.insert("status", value);
        } else {
            filter.insert("status", "active");
        }

        let options = FindOptions::builder()
            .sort(doc! { "generated_at": -1 })
            .limit(limit)
            .build();
        let mut cursor = tasks_collection
            .find(filter)
            .with_options(options)
            .await
            .context("Failed to query enrichment tasks")?;

        let mut response = Vec::new();
        while let Some(task) = cursor
            .try_next()
            .await
            .context("Failed to iterate enrichment tasks")?
        {
            response.push(self.task_to_view(&task));
        }
        Ok(response)
    }

    pub async fn delete_task(&self, template_id: &ObjectId, task_id: &ObjectId) -> Result<()> {
        let tasks_collection: Collection<TemplateEnrichmentTaskRecord> =
            self.mongo.collection("template_enrichment_tasks");
        let result = tasks_collection
            .update_one(
                doc! { "_id": task_id, "template_id": template_id },
                doc! { "$set": { "status": "rejected", "deleted_at": current_time() } },
            )
            .await
            .context("Failed to delete enrichment task")?;
        if result.matched_count == 0 {
            return Err(anyhow!("Task not found"));
        }
        Ok(())
    }

    pub async fn regenerate_task(
        &self,
        template_id: &ObjectId,
        task_id: &ObjectId,
        claims: &JwtClaims,
    ) -> Result<TemplateEnrichmentTaskView> {
        let template = self.load_template(template_id).await?;
        let settings = self.read_generation_settings(&template.metadata);
        let run_id = ObjectId::new();
        let runs_collection: Collection<TemplateEnrichmentRunRecord> =
            self.mongo.collection("template_enrichment_runs");
        let now = current_time();
        let mut run = TemplateEnrichmentRunRecord {
            id: run_id,
            template_id: *template_id,
            user_id: ObjectId::parse_str(&claims.sub).ok(),
            count: 1,
            allow_reuse: settings.allow_reuse,
            reject_limit: settings.reject_limit,
            status: TemplateEnrichmentRunStatus::InProgress,
            success_count: 0,
            error_count: 0,
            started_at: now,
            finished_at: None,
            error_message: None,
        };
        runs_collection
            .insert_one(&run)
            .await
            .context("Failed to create regeneration run")?;

        let tasks_collection: Collection<TemplateEnrichmentTaskRecord> =
            self.mongo.collection("template_enrichment_tasks");
        let instance = self
            .request_task_instance(&template, settings.allow_reuse)
            .await?;

        let metadata = self.metadata_to_document(&instance.metadata)?;
        let options = instance.options.clone().unwrap_or_default();
        let update = doc! {
            "$set": {
                "text": &instance.text,
                "correct_answer": &instance.correct_answer,
                "options": options,
                "metadata": metadata,
                "status": "active",
                "generated_at": current_time(),
                "run_id": &run.id,
                "deleted_at": Bson::Null,
            }
        };

        tasks_collection
            .update_one(doc! { "_id": task_id, "template_id": template_id }, update)
            .await
            .context("Failed to update task")?;

        run.success_count = 1;
        run.status = TemplateEnrichmentRunStatus::Completed;
        run.finished_at = Some(current_time());
        runs_collection
            .update_one(
                doc! { "_id": &run.id },
                doc! {
                    "$set": {
                        "status": run.status.as_str(),
                        "success_count": 1i64,
                        "error_count": 0i64,
                        "finished_at": run.finished_at,
                    }
                },
            )
            .await
            .ok();

        let updated = tasks_collection
            .find_one(doc! { "_id": task_id })
            .await
            .context("Failed to load updated task")?
            .ok_or_else(|| anyhow!("Task not found after regeneration"))?;

        Ok(self.task_to_view(&updated))
    }

    fn read_generation_settings(&self, metadata: &Document) -> GenerationSettings {
        if let Ok(settings) = metadata.get_document("generation_settings") {
            GenerationSettings {
                count: settings.get_i32("count").unwrap_or(1).max(1) as u32,
                allow_reuse: settings.get_bool("allow_reuse").unwrap_or(false),
                reject_limit: settings
                    .get("reject_limit")
                    .and_then(|value| value.as_i32())
                    .map(|v| v as u32),
            }
        } else {
            GenerationSettings::default()
        }
    }

    async fn request_task_instance(
        &self,
        template: &TemplateDocument,
        allow_reuse: bool,
    ) -> Result<TaskInstance> {
        let payload = GenerateInstancesRequest {
            level_id: template.level_id.to_hex(),
            count: 1,
            user_id: None,
            template_id: Some(template.id.to_hex()),
            allow_reuse,
        };

        let instances =
            request_instances(&self.http_client, &self.python_api_url, &payload).await?;
        if let Some(instance) = instances.into_iter().next() {
            Ok(instance)
        } else {
            Err(anyhow!("Template Generator returned no instances"))
        }
    }

    fn build_task_record(
        &self,
        template: &TemplateDocument,
        run_id: &ObjectId,
        instance: &TaskInstance,
    ) -> Result<TemplateEnrichmentTaskRecord> {
        let metadata = self.metadata_to_document(&instance.metadata)?;
        Ok(TemplateEnrichmentTaskRecord {
            id: ObjectId::new(),
            template_id: template.id,
            run_id: *run_id,
            text: instance.text.clone(),
            correct_answer: instance.correct_answer.clone(),
            options: instance.options.clone().unwrap_or_default(),
            metadata,
            status: "active".to_string(),
            generated_at: current_time(),
            generated_by: None,
            deleted_at: None,
        })
    }

    async fn load_template(&self, template_id: &ObjectId) -> Result<TemplateDocument> {
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        let template = collection
            .find_one(doc! { "_id": template_id })
            .await
            .context("Failed to load template")?
            .ok_or_else(|| anyhow!("Template not found"))?;
        Ok(template)
    }

    async fn store_generation_settings(
        &self,
        template_id: &ObjectId,
        request: &TemplateEnrichmentRequest,
    ) -> Result<()> {
        let mut settings_doc = doc! {
            "count": request.count as i32,
            "allow_reuse": request.allow_reuse,
        };
        if let Some(limit) = request.reject_limit {
            settings_doc.insert("reject_limit", limit as i32);
        } else {
            settings_doc.insert("reject_limit", Bson::Null);
        }
        let collection: Collection<TemplateDocument> = self.mongo.collection("templates");
        collection
            .update_one(
                doc! { "_id": template_id },
                doc! { "$set": { "metadata.generation_settings": settings_doc } },
            )
            .await
            .context("Failed to update template settings")?;
        Ok(())
    }

    async fn enforce_daily_limit(
        &self,
        template_id: &ObjectId,
        request: &TemplateEnrichmentRequest,
    ) -> Result<()> {
        if let Some(limit) = request.reject_limit {
            let cutoff = mongodb::bson::DateTime::from_millis(
                (Utc::now() - Duration::hours(24)).timestamp_millis(),
            );
            let tasks_collection: Collection<TemplateEnrichmentTaskRecord> =
                self.mongo.collection("template_enrichment_tasks");
            let existing = tasks_collection
                .count_documents(doc! {
                    "template_id": template_id,
                    "generated_at": { "$gte": cutoff },
                    "status": "active"
                })
                .await
                .context("Failed to count recent enrichment tasks")?;
            if existing as u32 >= limit {
                return Err(anyhow!("Daily generation limit reached for this template"));
            }
        }
        Ok(())
    }

    fn metadata_to_document(&self, metadata: &serde_json::Value) -> Result<Document> {
        match to_bson(metadata)? {
            Bson::Document(doc) => Ok(doc),
            other => Ok(doc! { "value": other }),
        }
    }

    fn run_to_summary(&self, record: &TemplateEnrichmentRunRecord) -> TemplateEnrichmentRunSummary {
        TemplateEnrichmentRunSummary {
            id: record.id.to_hex(),
            template_id: record.template_id.to_hex(),
            user_id: record.user_id.map(|id| id.to_hex()),
            count: record.count,
            allow_reuse: record.allow_reuse,
            reject_limit: record.reject_limit,
            status: record.status,
            success_count: record.success_count,
            error_count: record.error_count,
            started_at: to_rfc3339(&record.started_at),
            finished_at: record.finished_at.map(|dt| to_rfc3339(&dt)),
            error_message: record.error_message.clone(),
        }
    }

    fn task_to_view(&self, record: &TemplateEnrichmentTaskRecord) -> TemplateEnrichmentTaskView {
        TemplateEnrichmentTaskView {
            id: record.id.to_hex(),
            template_id: record.template_id.to_hex(),
            run_id: record.run_id.to_hex(),
            text: record.text.clone(),
            correct_answer: record.correct_answer.clone(),
            options: record.options.clone(),
            status: record.status.clone(),
            generated_at: to_rfc3339(&record.generated_at),
        }
    }
}

#[derive(Default)]
struct GenerationSettings {
    pub count: u32,
    pub allow_reuse: bool,
    pub reject_limit: Option<u32>,
}

fn current_time() -> mongodb::bson::DateTime {
    mongodb::bson::DateTime::from_millis(Utc::now().timestamp_millis())
}

fn to_rfc3339(dt: &mongodb::bson::DateTime) -> String {
    match Utc.timestamp_millis_opt(dt.timestamp_millis()) {
        chrono::LocalResult::Single(value) => value.to_rfc3339(),
        _ => Utc.timestamp_millis_opt(0).single().unwrap().to_rfc3339(),
    }
}
