use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use std::sync::Arc;

use crate::metrics;
use crate::services::AppState;

pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut status = "healthy";
    let mut dependencies = serde_json::Map::new();
    let mut all_healthy = true;

    // Check MongoDB
    let mongo_health = check_mongodb(&state).await;
    dependencies.insert("mongodb".to_string(), json!(mongo_health));
    if mongo_health.get("status").and_then(|v| v.as_str()) != Some("healthy") {
        all_healthy = false;
        status = "degraded";
    }

    // Check Redis
    let redis_health = check_redis(&state).await;
    dependencies.insert("redis".to_string(), json!(redis_health));
    if redis_health.get("status").and_then(|v| v.as_str()) != Some("healthy") {
        all_healthy = false;
        status = "degraded";
    }

    let status_code = if all_healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(json!({
            "status": status,
            "service": "trainingground-api",
            "version": env!("CARGO_PKG_VERSION"),
            "dependencies": dependencies
        })),
    )
}

async fn check_mongodb(state: &AppState) -> serde_json::Map<String, serde_json::Value> {
    let mut result = serde_json::Map::new();

    match tokio::time::timeout(
        std::time::Duration::from_secs(1),
        state.mongo.run_command(mongodb::bson::doc! { "ping": 1 }),
    )
    .await
    {
        Ok(Ok(_)) => {
            result.insert("status".to_string(), json!("healthy"));
            result.insert(
                "message".to_string(),
                json!("MongoDB connection successful"),
            );
        }
        Ok(Err(e)) => {
            result.insert("status".to_string(), json!("unhealthy"));
            result.insert("error".to_string(), json!(format!("MongoDB error: {}", e)));
        }
        Err(_) => {
            result.insert("status".to_string(), json!("unhealthy"));
            result.insert("error".to_string(), json!("MongoDB timeout after 1s"));
        }
    }

    result
}

async fn check_redis(state: &AppState) -> serde_json::Map<String, serde_json::Value> {
    let mut result = serde_json::Map::new();

    let mut conn = state.redis.clone();
    match tokio::time::timeout(
        std::time::Duration::from_millis(500),
        redis::cmd("PING").query_async::<String>(&mut conn),
    )
    .await
    {
        Ok(Ok(_)) => {
            result.insert("status".to_string(), json!("healthy"));
            result.insert("message".to_string(), json!("Redis connection successful"));
        }
        Ok(Err(e)) => {
            result.insert("status".to_string(), json!("unhealthy"));
            result.insert("error".to_string(), json!(format!("Redis error: {}", e)));
        }
        Err(_) => {
            result.insert("status".to_string(), json!("unhealthy"));
            result.insert("error".to_string(), json!("Redis timeout after 500ms"));
        }
    }

    result
}

pub async fn metrics_handler() -> impl IntoResponse {
    match metrics::render_metrics() {
        Ok(metrics_text) => (StatusCode::OK, metrics_text),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to render metrics: {}", e),
        ),
    }
}

pub mod sessions;
pub mod sse;
