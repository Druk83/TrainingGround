use axum::{
    extract::{Extension, State},
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::{
    extractors::AppJson,
    middlewares::auth::JwtClaims,
    models::system_settings::{
        AnticheatSettings, EmailSettings, SettingsTestResponse, SsoSettings,
        SystemSettingsResponse, YandexGptSettings,
    },
    services::{system_settings_service::SystemSettingsService, AppState},
};

use super::ApiError;

pub async fn get_system_settings(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SystemSettingsResponse>, ApiError> {
    let service = SystemSettingsService::new(state.mongo.clone());
    let settings = service.get_all().await.map_err(ApiError::from)?;
    Ok(Json(settings))
}

pub async fn update_yandexgpt_settings(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(payload): AppJson<YandexGptSettings>,
) -> Result<Json<YandexGptSettings>, ApiError> {
    let service = SystemSettingsService::new(state.mongo.clone());
    let updated = service
        .update_yandexgpt(payload, &claims.sub)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(updated))
}

pub async fn update_sso_settings(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(payload): AppJson<SsoSettings>,
) -> Result<Json<SsoSettings>, ApiError> {
    let service = SystemSettingsService::new(state.mongo.clone());
    let updated = service
        .update_sso(payload, &claims.sub)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(updated))
}

pub async fn update_email_settings(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(payload): AppJson<EmailSettings>,
) -> Result<Json<EmailSettings>, ApiError> {
    let service = SystemSettingsService::new(state.mongo.clone());
    let updated = service
        .update_email(payload, &claims.sub)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(updated))
}

pub async fn update_anticheat_settings(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(payload): AppJson<AnticheatSettings>,
) -> Result<Json<AnticheatSettings>, ApiError> {
    let service = SystemSettingsService::new(state.mongo.clone());
    let updated = service
        .update_anticheat(payload, &claims.sub)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(updated))
}

pub async fn test_yandexgpt_settings() -> impl IntoResponse {
    Json(SettingsTestResponse {
        success: true,
        message: Some("YandexGPT connection test is not configured; assuming success".into()),
    })
}

pub async fn test_sso_settings() -> impl IntoResponse {
    Json(SettingsTestResponse {
        success: true,
        message: Some("SSO test endpoint placeholder".into()),
    })
}

pub async fn test_email_settings() -> impl IntoResponse {
    Json(SettingsTestResponse {
        success: true,
        message: Some("Email test endpoint placeholder".into()),
    })
}
