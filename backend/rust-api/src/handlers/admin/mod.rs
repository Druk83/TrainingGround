mod audit;
mod backups;
mod feature_flags;
mod groups;
mod incidents;
mod settings;
mod system;
mod users;

pub use audit::*;
pub use backups::*;
pub use feature_flags::*;
pub use groups::*;
pub use incidents::*;
pub use settings::*;
pub use system::*;
pub use users::*;

use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use mongodb::bson::oid::ObjectId;
use std::sync::Arc;

use crate::{
    middlewares::auth::JwtClaims,
    models::content::{
        EmbeddingConsistencyReport, EmbeddingJobSummary, EmbeddingRebuildRequest,
        LevelCreateRequest, LevelRecord, LevelReorderRequest, LevelUpdateRequest, QueueStatus,
        RuleCoverage, RuleCreateRequest, RuleRecord, RuleUpdateRequest, TemplateCreateRequest,
        TemplateDetail, TemplateDuplicate, TemplateListQuery, TemplateRevertRequest,
        TemplateSummary, TemplateUpdateRequest, TemplateValidationIssue, TemplateVersionSummary,
        TopicCreateRequest, TopicRecord, TopicUpdateRequest,
    },
    services::{content_service::ContentService, AppState},
};

pub async fn list_templates(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TemplateListQuery>,
) -> Result<Json<Vec<TemplateSummary>>, ApiError> {
    let service = ContentService::new(&state);
    let data = service.list_templates(query).await?;
    Ok(Json(data))
}

pub async fn get_template(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<String>,
) -> Result<Json<TemplateDetail>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let detail = service
        .get_template(&template_obj)
        .await?
        .ok_or_else(|| ApiError::not_found("Template not found"))?;
    Ok(Json(detail))
}

pub async fn create_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<TemplateCreateRequest>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let summary = service.create_template(payload, &claims).await?;
    Ok(Json(summary))
}

pub async fn update_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(template_id): Path<String>,
    Json(payload): Json<TemplateUpdateRequest>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let summary = service
        .update_template(&template_obj, payload, &claims)
        .await?;
    Ok(Json(summary))
}

pub async fn list_topics(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TopicRecord>>, ApiError> {
    let service = ContentService::new(&state);
    let topics = service.list_topics().await?;
    Ok(Json(topics))
}

pub async fn create_topic(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<TopicCreateRequest>,
) -> Result<Json<TopicRecord>, ApiError> {
    let service = ContentService::new(&state);
    let topic = service.create_topic(payload, &claims).await?;
    Ok(Json(topic))
}

pub async fn update_topic(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(topic_id): Path<String>,
    Json(payload): Json<TopicUpdateRequest>,
) -> Result<Json<TopicRecord>, ApiError> {
    let service = ContentService::new(&state);
    let topic_obj = parse_object_id(&topic_id, "topic_id")?;
    let topic = service.update_topic(&topic_obj, payload, &claims).await?;
    Ok(Json(topic))
}

pub async fn delete_topic(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(topic_id): Path<String>,
) -> Result<Json<()>, ApiError> {
    let service = ContentService::new(&state);
    let topic_obj = parse_object_id(&topic_id, "topic_id")?;
    service.delete_topic(&topic_obj, &claims).await?;
    Ok(Json(()))
}

pub async fn list_levels(
    State(state): State<Arc<AppState>>,
    Path(topic_id): Path<String>,
) -> Result<Json<Vec<LevelRecord>>, ApiError> {
    let service = ContentService::new(&state);
    let topic_obj = parse_object_id(&topic_id, "topic_id")?;
    let levels = service.list_levels_for_topic(&topic_obj).await?;
    Ok(Json(levels))
}

pub async fn create_level(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<LevelCreateRequest>,
) -> Result<Json<LevelRecord>, ApiError> {
    let service = ContentService::new(&state);
    let level = service.create_level(payload, &claims).await?;
    Ok(Json(level))
}

pub async fn update_level(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(level_id): Path<String>,
    Json(payload): Json<LevelUpdateRequest>,
) -> Result<Json<LevelRecord>, ApiError> {
    let service = ContentService::new(&state);
    let level_obj = parse_object_id(&level_id, "level_id")?;
    let level = service.update_level(&level_obj, payload, &claims).await?;
    Ok(Json(level))
}

pub async fn delete_level(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(level_id): Path<String>,
) -> Result<Json<()>, ApiError> {
    let service = ContentService::new(&state);
    let level_obj = parse_object_id(&level_id, "level_id")?;
    service.delete_level(&level_obj, &claims).await?;
    Ok(Json(()))
}

pub async fn reorder_levels(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LevelReorderRequest>,
) -> Result<Json<()>, ApiError> {
    let service = ContentService::new(&state);
    service.reorder_levels(payload).await?;
    Ok(Json(()))
}

pub async fn list_rules(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<RuleRecord>>, ApiError> {
    let service = ContentService::new(&state);
    let rules = service.list_rules().await?;
    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<RuleCreateRequest>,
) -> Result<Json<RuleRecord>, ApiError> {
    let service = ContentService::new(&state);
    let rule = service.create_rule(payload, &claims).await?;
    Ok(Json(rule))
}

pub async fn update_rule(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(rule_id): Path<String>,
    Json(payload): Json<RuleUpdateRequest>,
) -> Result<Json<RuleRecord>, ApiError> {
    let service = ContentService::new(&state);
    let rule_obj = parse_object_id(&rule_id, "rule_id")?;
    let rule = service.update_rule(&rule_obj, payload, &claims).await?;
    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(rule_id): Path<String>,
) -> Result<Json<()>, ApiError> {
    let service = ContentService::new(&state);
    let rule_obj = parse_object_id(&rule_id, "rule_id")?;
    service.delete_rule(&rule_obj, &claims).await?;
    Ok(Json(()))
}

pub async fn rule_coverage(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<RuleCoverage>>, ApiError> {
    let service = ContentService::new(&state);
    let coverage = service.rule_coverage().await?;
    Ok(Json(coverage))
}

pub async fn revert_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(template_id): Path<String>,
    Json(payload): Json<TemplateRevertRequest>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let summary = service
        .revert_template(&template_obj, payload, &claims)
        .await?;
    Ok(Json(summary))
}

pub async fn list_template_versions(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<String>,
) -> Result<Json<Vec<TemplateVersionSummary>>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let versions = service.list_template_versions(&template_obj).await?;
    Ok(Json(versions))
}

pub async fn submit_template_for_moderation(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(template_id): Path<String>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let summary = service
        .submit_template_for_moderation(&template_obj, &claims)
        .await?;
    Ok(Json(summary))
}

pub async fn approve_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(template_id): Path<String>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let summary = service.approve_template(&template_obj, &claims).await?;
    Ok(Json(summary))
}

pub async fn reject_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(template_id): Path<String>,
    Json(payload): Json<TemplateRevertRequest>,
) -> Result<Json<TemplateSummary>, ApiError> {
    let service = ContentService::new(&state);
    let template_obj = parse_object_id(&template_id, "template_id")?;
    let summary = service
        .reject_template(&template_obj, payload, &claims)
        .await?;
    Ok(Json(summary))
}

pub async fn validate_templates(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TemplateValidationIssue>>, ApiError> {
    let service = ContentService::new(&state);
    let issues = service.validate_all_templates().await?;
    Ok(Json(issues))
}

pub async fn list_duplicates(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TemplateDuplicate>>, ApiError> {
    let service = ContentService::new(&state);
    let duplicates = service.detect_duplicate_templates().await?;
    Ok(Json(duplicates))
}

pub async fn rebuild_embeddings(
    State(state): State<Arc<AppState>>,
    Extension(_claims): Extension<JwtClaims>,
    Json(payload): Json<EmbeddingRebuildRequest>,
) -> Result<Json<EmbeddingJobSummary>, ApiError> {
    let service = ContentService::new(&state);
    let summary = service.rebuild_embeddings(payload).await?;
    Ok(Json(summary))
}

pub async fn embedding_progress(
    State(state): State<Arc<AppState>>,
) -> Result<Json<EmbeddingJobSummary>, ApiError> {
    let service = ContentService::new(&state);
    let summary = service.get_embedding_progress().await?;
    Ok(Json(summary))
}

pub async fn embedding_consistency(
    State(state): State<Arc<AppState>>,
) -> Result<Json<EmbeddingConsistencyReport>, ApiError> {
    let service = ContentService::new(&state);
    let report = service.check_embeddings_consistency().await?;
    Ok(Json(report))
}

pub async fn queue_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<QueueStatus>, ApiError> {
    let service = ContentService::new(&state);
    let status = service.queue_status().await?;
    Ok(Json(status))
}

fn parse_object_id(value: &str, field: &str) -> Result<ObjectId, ApiError> {
    ObjectId::parse_str(value)
        .map_err(|_| ApiError::bad_request(format!("Invalid {}: must be ObjectId", field)))
}

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        ApiError::BadRequest(message.into())
    }

    fn not_found(message: impl Into<String>) -> Self {
        ApiError::NotFound(message.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::Internal(err.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        (status, Json(message)).into_response()
    }
}
