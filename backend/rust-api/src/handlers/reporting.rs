use std::{sync::Arc, time::Duration};

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use mongodb::bson::{doc, oid::ObjectId};
use serde::{Deserialize, Serialize};

use crate::{
    extractors::AppJson,
    middlewares::auth::JwtClaims,
    models::{
        reporting::{
            ExportFormat, ExportStatus, LeaderboardDocument, LeaderboardScope, MaterializedStat,
            NewReportExport, ReportFilters, TimeRange,
        },
        ProgressSummary,
    },
    services::{reporting_service::ReportingService, AppState},
};

pub(crate) async fn get_group_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(group_id): Path<String>,
) -> Result<Json<GroupStatsResponse>, ApiError> {
    let group_obj = parse_object_id(&group_id, "group_id")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| ApiError::forbidden("Access denied for this group"))?;

    let stats = service
        .load_group_snapshot(&group_obj)
        .await?
        .ok_or_else(|| ApiError::not_found("Group statistics not found"))?;
    let leaderboard = service
        .load_leaderboard(LeaderboardScope::Group, Some(&group_obj))
        .await?;

    Ok(Json(GroupStatsResponse {
        group_id,
        stats,
        leaderboard,
    }))
}

pub(crate) async fn get_user_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
) -> Result<Json<UserStatsResponse>, ApiError> {
    let user_obj = parse_object_id(&user_id, "user_id")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    if claims.role != "admin" {
        let group_ids = parse_group_ids(&claims.group_ids)?;
        let allowed = service
            .user_belongs_to_groups(&user_obj, &group_ids)
            .await?;
        if !allowed {
            return Err(ApiError::forbidden("User does not belong to your groups"));
        }
    }

    let progress = service.load_user_progress(&user_obj).await?;

    Ok(Json(UserStatsResponse { user_id, progress }))
}

pub(crate) async fn get_topic_stats(
    State(state): State<Arc<AppState>>,
    Path(topic_id): Path<String>,
) -> Result<Json<TopicStatsResponse>, ApiError> {
    let topic_obj = parse_object_id(&topic_id, "topic_id")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());

    let stats = service
        .load_topic_snapshot(&topic_obj)
        .await?
        .ok_or_else(|| ApiError::not_found("Topic statistics not found"))?;

    Ok(Json(TopicStatsResponse { topic_id, stats }))
}

pub(crate) async fn request_group_export(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(group_id): Path<String>,
    AppJson(payload): AppJson<ExportRequest>,
) -> Result<Json<ExportResponse>, ApiError> {
    let group_obj = parse_object_id(&group_id, "group_id")?;
    let teacher_id = parse_object_id(&claims.sub, "teacher_id")?;

    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());

    service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| ApiError::forbidden("Access denied for export"))?;

    let recent_exports = service
        .count_exports_in_window(&teacher_id, Duration::from_secs(3600))
        .await?;
    if recent_exports >= state.config.reporting.export_rate_limit_per_hour.into() {
        return Err(ApiError::too_many_requests(
            "Export rate limit exceeded for the current hour",
        ));
    }

    let topic_ids = payload
        .topic_ids
        .into_iter()
        .filter_map(|value| ObjectId::parse_str(&value).ok())
        .collect::<Vec<_>>();

    let filters = ReportFilters {
        topic_ids,
        period: TimeRange {
            from: payload.period.from,
            to: payload.period.to,
        },
    };

    let expires_at = Utc::now()
        + ChronoDuration::from_std(state.config.reporting.export_expiration())
            .map_err(|_| ApiError::internal("Invalid export expiration configured"))?;

    let export = service
        .create_export_request(NewReportExport {
            group_id: group_obj,
            teacher_id,
            format: payload.format.into(),
            filters,
            expires_at,
        })
        .await?;

    Ok(Json(ExportResponse {
        export_id: export.id.to_string(),
        status: export.status,
        expires_at: export.expires_at,
    }))
}

pub(crate) async fn get_export_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(export_id): Path<String>,
) -> Result<Json<ExportStatusResponse>, ApiError> {
    let export_obj = parse_object_id(&export_id, "export_id")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    let export = service
        .get_export_by_id(&export_obj)
        .await?
        .ok_or_else(|| ApiError::not_found("Export not found"))?;

    if claims.role != "admin" {
        let teacher_obj = parse_object_id(&claims.sub, "teacher_id")?;
        if export.teacher_id != teacher_obj {
            return Err(ApiError::forbidden("Export not found"));
        }
    }

    let mut download_url = None;
    if export.status == ExportStatus::Ready {
        if let Some(key) = &export.storage_key {
            if let Some(storage) = state.object_storage.as_ref() {
                download_url = Some(
                    storage
                        .generate_presigned_download_url(
                            key,
                            state.config.reporting.signed_url_ttl(),
                        )
                        .map_err(|err| {
                            ApiError::internal(format!("Failed to sign download URL: {}", err))
                        })?,
                );
            }
        }
    }

    Ok(Json(ExportStatusResponse {
        export_id: export.id.to_hex(),
        status: export.status,
        format: export.format,
        expires_at: export.expires_at,
        completed_at: export.completed_at,
        download_url,
        error: export.error,
    }))
}

#[derive(Debug, Serialize)]
pub(crate) struct GroupStatsResponse {
    group_id: String,
    stats: MaterializedStat,
    leaderboard: Option<LeaderboardDocument>,
}

#[derive(Debug, Serialize)]
pub(crate) struct UserStatsResponse {
    user_id: String,
    progress: Vec<ProgressSummary>,
}

#[derive(Debug, Serialize)]
pub(crate) struct TopicStatsResponse {
    topic_id: String,
    stats: MaterializedStat,
}

#[derive(Debug, Serialize)]
pub(crate) struct ExportResponse {
    export_id: String,
    status: ExportStatus,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ExportStatusResponse {
    export_id: String,
    status: ExportStatus,
    format: ExportFormat,
    expires_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    download_url: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ExportRequest {
    #[serde(default)]
    topic_ids: Vec<String>,
    period: TimeRangeRequest,
    format: ExportFormatRequest,
}

#[derive(Debug, Deserialize)]
pub(crate) struct TimeRangeRequest {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ExportFormatRequest {
    Csv,
    Pdf,
    Xlsx,
}

impl From<ExportFormatRequest> for ExportFormat {
    fn from(value: ExportFormatRequest) -> Self {
        match value {
            ExportFormatRequest::Csv => ExportFormat::Csv,
            ExportFormatRequest::Pdf => ExportFormat::Pdf,
            ExportFormatRequest::Xlsx => ExportFormat::Xlsx,
        }
    }
}

#[derive(Debug)]
pub(crate) enum ApiError {
    BadRequest(String),
    Forbidden(String),
    NotFound(String),
    TooManyRequests(String),
    Internal(String),
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        ApiError::BadRequest(message.into())
    }

    fn forbidden(message: impl Into<String>) -> Self {
        ApiError::Forbidden(message.into())
    }

    fn not_found(message: impl Into<String>) -> Self {
        ApiError::NotFound(message.into())
    }

    fn too_many_requests(message: impl Into<String>) -> Self {
        ApiError::TooManyRequests(message.into())
    }

    fn internal(message: impl Into<String>) -> Self {
        ApiError::Internal(message.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::internal(err.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            ApiError::TooManyRequests(message) => (StatusCode::TOO_MANY_REQUESTS, message),
            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };

        (status, Json(message)).into_response()
    }
}

fn parse_object_id(value: &str, field: &str) -> Result<ObjectId, ApiError> {
    ObjectId::parse_str(value)
        .map_err(|_| ApiError::bad_request(format!("Invalid {}: must be ObjectId", field)))
}

fn parse_group_ids(values: &[String]) -> Result<Vec<ObjectId>, ApiError> {
    Ok(values
        .iter()
        .filter_map(|value| ObjectId::parse_str(value).ok())
        .collect())
}
