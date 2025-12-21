use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
};
use chrono::Utc;
use futures::stream::{self, Stream};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

use crate::{
    models::timer::{TimeExpired, TimerEvent, TimerTick},
    services::{session_service::SessionService, AppState},
};

/// SSE endpoint for timer events
/// GET /api/v1/sessions/{id}/stream
pub async fn session_stream(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Client connected to SSE stream: session={}", session_id);

    // Verify session exists
    let session_service = SessionService::new(state.mongo.clone(), state.redis.clone());
    let session = session_service
        .get_session(&session_id)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Session not found".to_string()))?;

    // Calculate timer duration from session
    let started_at = session.started_at;
    let expires_at = session.expires_at;
    let total_seconds = (expires_at - started_at).num_seconds() as u32;

    let capped_seconds = std::cmp::min(total_seconds, max_stream_duration_seconds());
    let tick_interval = tick_interval_ms();
    tracing::info!(
        "Starting SSE stream: session={}, configured_duration={}s, tick_interval={}ms",
        session_id,
        capped_seconds,
        tick_interval
    );
    let stream = create_timer_stream(session_id.clone(), capped_seconds, tick_interval);

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

fn max_stream_duration_seconds() -> u32 {
    std::env::var("SSE_MAX_STREAM_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(3600)
}

fn tick_interval_ms() -> u64 {
    std::env::var("SSE_TICK_INTERVAL_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(1000)
}

/// Create a stream of timer events
fn create_timer_stream(
    session_id: String,
    total_seconds: u32,
    tick_interval_ms: u64,
) -> impl Stream<Item = Result<Event, Infallible>> {
    stream::unfold(
        (session_id.clone(), 0u32, total_seconds, false),
        move |(sid, elapsed, total, final_sent)| async move {
            if final_sent {
                return None;
            }

            if elapsed >= total {
                // Send final time-expired event once
                let expired_event = TimerEvent::TimeExpired(TimeExpired {
                    session_id: sid.clone(),
                    timestamp: Utc::now(),
                    message: "Time limit exceeded".to_string(),
                });

                let event = Event::default()
                    .event(expired_event.event_name())
                    .data(expired_event.to_sse_data());

                tracing::info!("Timer expired: session={}", sid);
                return Some((Ok(event), (sid, elapsed, total, true)));
            }

            if elapsed > total {
                return None;
            }

            // Send timer-tick event
            let remaining = total.saturating_sub(elapsed);
            let tick_event = TimerEvent::TimerTick(TimerTick {
                session_id: sid.clone(),
                remaining_seconds: remaining,
                elapsed_seconds: elapsed,
                total_seconds: total,
                timestamp: Utc::now(),
            });

            let event = Event::default()
                .event(tick_event.event_name())
                .data(tick_event.to_sse_data());

            // Wait 1 second before next tick
            sleep(Duration::from_millis(tick_interval_ms)).await;

            Some((Ok(event), (sid, elapsed + 1, total, false)))
        },
    )
}
