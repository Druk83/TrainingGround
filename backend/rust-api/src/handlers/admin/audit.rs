use axum::{
    extract::{Query, State},
    http::{header, HeaderValue},
    response::Response,
    Json,
};
use std::sync::Arc;

use crate::{
    models::audit_log::{AuditLog, AuditLogQuery},
    services::{audit_service::AuditService, AppState},
};

use super::ApiError;

pub async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditLogQuery>,
) -> Result<Json<Vec<AuditLog>>, ApiError> {
    let service = AuditService::new(state.mongo.clone());
    let logs = service.list_logs(query).await.map_err(ApiError::from)?;
    Ok(Json(logs))
}

pub async fn export_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditLogQuery>,
) -> Result<Response, ApiError> {
    let service = AuditService::new(state.mongo.clone());
    let logs = service
        .export_logs(query, 1000)
        .await
        .map_err(ApiError::from)?;

    let mut csv = String::from("timestamp,event_type,user_id,email,success,ip,details\n");
    for log in logs {
        let timestamp = log.created_at.to_rfc3339();
        let event = log.event_type.as_str();
        let user_id = log.user_id.unwrap_or_default();
        let email = log.email.unwrap_or_default();
        let success = log.success;
        let ip = log.ip.unwrap_or_default();
        let details = log.details.unwrap_or_default().replace('\n', " ");

        csv.push_str(&format!(
            "\"{timestamp}\",\"{event}\",\"{user_id}\",\"{email}\",{success},\"{ip}\",\"{details}\"\n"
        ));
    }

    let mut response = Response::new(csv.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"audit-log.csv\""),
    );

    Ok(response)
}
