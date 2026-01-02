use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use mongodb::bson::Document;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::warn;

use crate::services::AppState;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct FeatureFlagsQuery {
    user_id: Option<String>,
    group_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FeatureFlagsResponse {
    pub flags: Vec<FlagInfo>,
}

#[derive(Debug, Serialize)]
pub struct FlagInfo {
    pub flag_key: String,
    pub enabled: bool,
    pub config: serde_json::Value,
}

/// GET /api/feature-flags - Get active feature flags for user
/// Query parameters:
/// - user_id: Optional user ID for user-scoped flags
/// - group_id: Optional group ID for group-scoped flags
pub async fn get_feature_flags(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FeatureFlagsQuery>,
) -> impl IntoResponse {
    let collection = state.mongo.collection::<Document>("feature_flags");

    match collection.find(Default::default()).await {
        Ok(mut cursor) => {
            let mut flags = Vec::new();

            while let Ok(true) = cursor.advance().await {
                if let Ok(flag_doc) = cursor.deserialize_current() {
                    // Check if flag is enabled for this user/group
                    let flag_key = flag_doc
                        .get("flag_key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let enabled = flag_doc
                        .get("enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    if !enabled {
                        continue; // Skip disabled flags
                    }

                    let scope = flag_doc
                        .get("scope")
                        .and_then(|v| v.as_str())
                        .unwrap_or("global");

                    let target_ids: Vec<String> = flag_doc
                        .get("target_ids")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();

                    // Check if flag applies to this user
                    let applies = match scope {
                        "global" => true,
                        "user" => query
                            .user_id
                            .as_ref()
                            .is_some_and(|id| target_ids.contains(id)),
                        "group" => query
                            .group_id
                            .as_ref()
                            .is_some_and(|id| target_ids.contains(id)),
                        _ => false,
                    };

                    if applies {
                        let config = flag_doc
                            .get("config")
                            .and_then(|bson_val| {
                                // Convert BSON to JSON
                                if let Ok(json_str) = serde_json::to_string(bson_val) {
                                    serde_json::from_str(&json_str).ok()
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(serde_json::Value::Object(Default::default()));

                        flags.push(FlagInfo {
                            flag_key: flag_key.to_string(),
                            enabled: true,
                            config,
                        });
                    }
                }
            }

            (StatusCode::OK, Json(FeatureFlagsResponse { flags })).into_response()
        }
        Err(e) => {
            warn!("Failed to fetch feature flags: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch feature flags" })),
            )
                .into_response()
        }
    }
}
