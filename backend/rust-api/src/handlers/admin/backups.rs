use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::{
    models::backup::BackupCreateRequest,
    services::{backup_service::BackupService, AppState},
};

pub async fn list_backups(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = BackupService::new(state.mongo.clone());
    let records = service
        .list_backups()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(records))
}

pub async fn create_backup(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BackupCreateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = BackupService::new(state.mongo.clone());
    let response = service
        .create_backup(payload, "admin")
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn restore_backup(
    State(state): State<Arc<AppState>>,
    Path(backup_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = BackupService::new(state.mongo.clone());
    let response = service
        .restore_backup(&backup_id, "admin")
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok((StatusCode::OK, Json(response)))
}
