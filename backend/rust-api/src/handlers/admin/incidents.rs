use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::{
    middlewares::auth::JwtClaims,
    models::anticheat::{ListIncidentsQuery, UpdateIncidentRequest},
    services::{
        audit_service::AuditService, incidents_service::IncidentsService,
        user_management_service::UserManagementService, AppState,
    },
};

pub async fn list_incidents(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListIncidentsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = IncidentsService::new(state.mongo.clone());
    let incidents = service
        .list_incidents(query)
        .await
        .map_err(internal_error)?;

    Ok(Json(incidents))
}

pub async fn get_incident(
    State(state): State<Arc<AppState>>,
    Path(incident_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = IncidentsService::new(state.mongo.clone());
    let incident = service
        .get_incident(&incident_id)
        .await
        .map_err(not_found_or_internal)?;

    Ok(Json(incident))
}

pub async fn update_incident(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(incident_id): Path<String>,
    Json(payload): Json<UpdateIncidentRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = IncidentsService::new(state.mongo.clone());
    let updated = service
        .update_incident_status(&incident_id, payload.action, payload.note, &claims.sub)
        .await
        .map_err(not_found_or_internal)?;

    Ok(Json(updated))
}

pub async fn unblock_incident_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(incident_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let incidents_service = IncidentsService::new(state.mongo.clone());
    let incident = incidents_service
        .get_incident(&incident_id)
        .await
        .map_err(not_found_or_internal)?;
    let user_id = incident.incident.user_id.clone();

    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let unblocked_user = user_service.unblock_user(&user_id).await.map_err(|e| {
        if e.to_string().contains("not found") {
            (StatusCode::NOT_FOUND, e.to_string())
        } else {
            (StatusCode::BAD_REQUEST, e.to_string())
        }
    })?;

    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_unblock(&claims.sub, &user_id, None, None)
        .await;

    Ok(Json(unblocked_user))
}

fn internal_error(err: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

fn not_found_or_internal(err: anyhow::Error) -> (StatusCode, String) {
    if err.to_string().to_lowercase().contains("not found") {
        (StatusCode::NOT_FOUND, err.to_string())
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
    }
}
