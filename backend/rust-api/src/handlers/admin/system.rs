use std::sync::Arc;

use anyhow::Context;
use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use mongodb::bson::{doc, DateTime as BsonDateTime};
use redis::aio::ConnectionManager;

use crate::{models::system_metrics::SystemMetricsResponse, services::AppState};

use super::ApiError;

pub async fn get_system_metrics(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SystemMetricsResponse>, ApiError> {
    let metrics = gather_system_metrics(&state).await?;
    Ok(Json(metrics))
}

async fn gather_system_metrics(state: &AppState) -> anyhow::Result<SystemMetricsResponse> {
    let users_collection = state.mongo.collection::<mongodb::bson::Document>("users");
    let groups_collection = state.mongo.collection::<mongodb::bson::Document>("groups");
    let incidents_collection = state
        .mongo
        .collection::<mongodb::bson::Document>("incidents");
    let audit_collection = state
        .mongo
        .collection::<mongodb::bson::Document>("audit_log");

    let total_users = users_collection
        .estimated_document_count()
        .await
        .context("Failed to count users")?;
    let blocked_users = users_collection
        .count_documents(doc! { "is_blocked": true })
        .await
        .context("Failed to count blocked users")?;

    let total_groups = groups_collection
        .estimated_document_count()
        .await
        .context("Failed to count groups")?;

    let total_incidents = incidents_collection
        .estimated_document_count()
        .await
        .context("Failed to count incidents")?;
    let open_incidents = incidents_collection
        .count_documents(doc! { "status": "open" })
        .await
        .context("Failed to count open incidents")?;
    let critical_incidents = incidents_collection
        .count_documents(doc! { "severity": "critical", "status": "open" })
        .await
        .context("Failed to count critical incidents")?;

    let last_24h = Utc::now() - Duration::hours(24);
    let audit_events_24h = audit_collection
        .count_documents(doc! { "createdAt": { "$gte": BsonDateTime::from_millis(last_24h.timestamp_millis()) } })
        .await
        .context("Failed to count audit events")?;

    let active_sessions = count_active_sessions(&state.redis).await?;

    Ok(SystemMetricsResponse {
        uptime_seconds: state.start_time.elapsed().as_secs(),
        total_users,
        blocked_users,
        total_groups,
        total_incidents,
        open_incidents,
        critical_incidents,
        audit_events_24h,
        active_sessions,
    })
}

async fn count_active_sessions(redis: &ConnectionManager) -> anyhow::Result<u64> {
    let mut conn = redis.clone();
    let mut cursor = "0".to_string();
    let mut total = 0u64;

    loop {
        let (next_cursor, keys): (String, Vec<String>) = redis::cmd("SCAN")
            .arg(&cursor)
            .arg("MATCH")
            .arg("session:*")
            .arg("COUNT")
            .arg(1000)
            .query_async(&mut conn)
            .await
            .context("Failed to scan Redis for sessions")?;

        total += keys.len() as u64;

        if next_cursor == "0" {
            break;
        }

        cursor = next_cursor;
    }

    Ok(total)
}
