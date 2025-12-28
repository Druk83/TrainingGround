mod audit;
mod backups;
mod groups;
mod incidents;
mod settings;
mod system;
mod users;

pub use audit::*;
pub use backups::*;
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
        FeatureFlagRecord, FeatureFlagUpdateRequest, QueueStatus, TemplateCreateRequest,
        TemplateDetail, TemplateListQuery, TemplateRevertRequest, TemplateSummary,
        TemplateUpdateRequest,
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

pub async fn queue_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<QueueStatus>, ApiError> {
    let service = ContentService::new(&state);
    let status = service.queue_status().await?;
    Ok(Json(status))
}

pub async fn list_feature_flags(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<FeatureFlagRecord>>, ApiError> {
    let service = ContentService::new(&state);
    let list = service.list_feature_flags().await?;
    Ok(Json(list))
}

pub async fn update_feature_flag(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(flag_name): Path<String>,
    Json(payload): Json<FeatureFlagUpdateRequest>,
) -> Result<Json<FeatureFlagRecord>, ApiError> {
    let service = ContentService::new(&state);
    let updated = service
        .update_feature_flag(&flag_name, payload, &claims)
        .await?;
    Ok(Json(updated))
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
