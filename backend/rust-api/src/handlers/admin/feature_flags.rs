use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use mongodb::bson::{doc, Document};
use redis::AsyncCommands;
use serde_json::json;
use std::sync::Arc;
use tracing::{info, warn};

use crate::{models::feature_flag::FeatureFlagCreateRequest, services::AppState};

/// Dependencies between feature flags
/// If a flag requires another flag to be enabled
const FLAG_DEPENDENCIES: &[(&str, &str)] = &[
    ("hints_enabled", "explanation_api_enabled"),
    // Add more as needed
];

/// GET /admin/feature-flags - List all feature flags
pub async fn list_feature_flags(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let collection = state.mongo.collection::<Document>("feature_flags");

    match collection.find(doc! {}).await {
        Ok(mut cursor) => {
            let mut flags = Vec::new();
            while let Ok(true) = cursor.advance().await {
                if let Ok(flag) = cursor.deserialize_current() {
                    flags.push(flag);
                }
            }
            (StatusCode::OK, Json(json!({ "flags": flags }))).into_response()
        }
        Err(e) => {
            warn!("Failed to list feature flags: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to list feature flags" })),
            )
                .into_response()
        }
    }
}

/// GET /admin/feature-flags/:flag_key - Get specific flag
pub async fn get_feature_flag(
    State(state): State<Arc<AppState>>,
    Path(flag_key): Path<String>,
) -> impl IntoResponse {
    let collection = state.mongo.collection::<Document>("feature_flags");

    match collection.find_one(doc! { "flag_key": &flag_key }).await {
        Ok(Some(flag)) => (StatusCode::OK, Json(flag)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Flag not found" })),
        )
            .into_response(),
        Err(e) => {
            warn!("Failed to get feature flag {}: {}", flag_key, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to get feature flag" })),
            )
                .into_response()
        }
    }
}

/// POST /admin/feature-flags - Create new flag
pub async fn create_feature_flag(
    State(state): State<Arc<AppState>>,
    Json(req): Json<FeatureFlagCreateRequest>,
) -> impl IntoResponse {
    // Validate flag_key format
    if !req
        .flag_key
        .chars()
        .all(|c| c.is_ascii_lowercase() || c == '_' || c.is_ascii_digit())
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "flag_key must contain only lowercase letters, digits, and underscores"
            })),
        )
            .into_response();
    }

    // Validate scope
    if !["global", "group", "user"].contains(&req.scope.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid scope. Must be 'global', 'group', or 'user'" })),
        )
            .into_response();
    }

    let collection = state.mongo.collection::<Document>("feature_flags");

    // Check if flag already exists
    if let Ok(Some(_)) = collection
        .find_one(doc! { "flag_key": &req.flag_key })
        .await
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "Flag already exists" })),
        )
            .into_response();
    }

    let now = Utc::now();
    let doc_to_insert = doc! {
        "flag_key": &req.flag_key,
        "description": &req.description,
        "enabled": req.enabled,
        "scope": &req.scope,
        "target_ids": &req.target_ids,
        "config": mongodb::bson::to_bson(&req.config).unwrap_or_default(),
        "version": 1,
        "updated_at": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "updated_by": "system",
        "change_reason": &req.change_reason,
    };

    match collection.insert_one(doc_to_insert).await {
        Ok(_) => {
            info!("Feature flag created: {}", req.flag_key);
            (StatusCode::CREATED, Json(json!(req))).into_response()
        }
        Err(e) => {
            warn!("Failed to create feature flag: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to create feature flag" })),
            )
                .into_response()
        }
    }
}

/// PUT /admin/feature-flags/:flag_key - Update flag
pub async fn update_feature_flag(
    State(state): State<Arc<AppState>>,
    Path(flag_key): Path<String>,
    Json(req): Json<FeatureFlagCreateRequest>,
) -> impl IntoResponse {
    // Validate scope
    if !["global", "group", "user"].contains(&req.scope.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid scope. Must be 'global', 'group', or 'user'" })),
        )
            .into_response();
    }

    let collection = state.mongo.collection::<Document>("feature_flags");

    // Validate dependencies if enabling
    if req.enabled {
        for (flag, dep_flag) in FLAG_DEPENDENCIES {
            if flag_key == *flag {
                // Check if dependency is enabled
                if let Ok(Some(dep)) = collection.find_one(doc! { "flag_key": dep_flag }).await {
                    let dep_enabled: bool = dep
                        .get("enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    if !dep_enabled {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({
                                "error": format!("Flag '{}' requires '{}' to be enabled", flag, dep_flag)
                            })),
                        )
                            .into_response();
                    }
                }
            }
        }
    }

    let now = Utc::now();
    let update_doc = doc! {
        "$set": doc! {
            "description": &req.description,
            "enabled": req.enabled,
            "scope": &req.scope,
            "target_ids": &req.target_ids,
            "config": mongodb::bson::to_bson(&req.config).unwrap_or_default(),
            "version": doc! { "$add": [doc! { "$ifNull": ["$version", 0] }, 1] },
            "updated_at": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "updated_by": "system",
            "change_reason": &req.change_reason,
        }
    };

    match collection
        .update_one(doc! { "flag_key": &flag_key }, update_doc)
        .await
    {
        Ok(result) => {
            if result.matched_count == 0 {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "Flag not found" })),
                )
                    .into_response();
            }

            info!(
                "Feature flag updated: {}, reason: {}",
                flag_key, req.change_reason
            );

            // Log to audit_log
            let audit_collection = state.mongo.collection("audit_log");
            let audit_doc = doc! {
                "entity_type": "feature_flag",
                "entity_id": &flag_key,
                "action": "update",
                "changes": {
                    "enabled": req.enabled,
                    "scope": &req.scope,
                },
                "reason": &req.change_reason,
                "timestamp": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                "admin_id": "system",
            };
            let _ = audit_collection.insert_one(audit_doc).await;

            // Invalidate cache
            let _: Result<(), _> = state.redis.clone().del(format!("ff:{}:*", flag_key)).await;

            (StatusCode::OK, Json(json!(req))).into_response()
        }
        Err(e) => {
            warn!("Failed to update feature flag: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to update feature flag" })),
            )
                .into_response()
        }
    }
}

/// DELETE /admin/feature-flags/:flag_key - Delete flag
pub async fn delete_feature_flag(
    State(state): State<Arc<AppState>>,
    Path(flag_key): Path<String>,
) -> impl IntoResponse {
    let collection = state.mongo.collection::<Document>("feature_flags");

    match collection.delete_one(doc! { "flag_key": &flag_key }).await {
        Ok(result) => {
            if result.deleted_count == 0 {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "Flag not found" })),
                )
                    .into_response();
            }

            info!("Feature flag deleted: {}", flag_key);

            // Invalidate cache
            let _: Result<(), _> = state.redis.clone().del(format!("ff:{}:*", flag_key)).await;

            (StatusCode::NO_CONTENT).into_response()
        }
        Err(e) => {
            warn!("Failed to delete feature flag: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to delete feature flag" })),
            )
                .into_response()
        }
    }
}
