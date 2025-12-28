use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::{
    models::{answer::SubmitAnswerRequest, hint::RequestHintRequest, *},
    services::{
        answer_service::AnswerService, hint_service::HintService, session_service::SessionService,
        AppState,
    },
};

pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!(
        "Creating session for user_id={}, task_id={}",
        req.user_id,
        req.task_id
    );

    let service = SessionService::new(state.mongo.clone(), state.redis.clone());

    match service.create_session(req).await {
        Ok(response) => Ok((StatusCode::CREATED, Json(response))),
        Err(e) => {
            tracing::error!("Failed to create session: {}", e);
            let msg = e.to_string();
            let status = if msg.contains("Task not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            Err((status, msg))
        }
    }
}

pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Getting session: {}", session_id);

    let service = SessionService::new(state.mongo.clone(), state.redis.clone());

    match service.get_session(&session_id).await {
        Ok(session) => Ok((StatusCode::OK, Json(session))),
        Err(_) => Err((StatusCode::NOT_FOUND, "Session not found".to_string())),
    }
}

pub async fn complete_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Completing session: {}", session_id);

    let service = SessionService::new(state.mongo.clone(), state.redis.clone());

    match service.complete_session(&session_id).await {
        Ok(_) => Ok((StatusCode::NO_CONTENT, ())),
        Err(e) => {
            tracing::error!("Failed to complete session: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

pub async fn submit_answer(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(req): Json<SubmitAnswerRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Submitting answer for session: {}", session_id);

    // Get session to verify it exists and get user_id, task_id
    let session_service = SessionService::new(state.mongo.clone(), state.redis.clone());
    let session = session_service
        .get_session(&session_id)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Session not found".to_string()))?;

    // Process answer
    let answer_service = AnswerService::new(state.mongo.clone(), state.redis.clone());

    match answer_service
        .submit_answer(&session_id, &session.user_id, &session.task_id, &req)
        .await
    {
        Ok(response) => Ok((StatusCode::OK, Json(response))),
        Err(e) => {
            tracing::error!("Failed to submit answer: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

pub async fn request_hint(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(req): Json<RequestHintRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Requesting hint for session: {}", session_id);

    // Get session to extract user_id and task_id
    let session_service = SessionService::new(state.mongo.clone(), state.redis.clone());
    let session = session_service
        .get_session(&session_id)
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Session not found".to_string()))?;

    // Request hint
    let hint_service = HintService::new(
        state.mongo.clone(),
        state.redis.clone(),
        state.config.python_api_url.clone(),
    );

    match hint_service
        .request_hint(&session_id, &session.user_id, &session.task_id, &req)
        .await
    {
        Ok(response) => Ok((StatusCode::OK, Json(response))),
        Err(e) => {
            tracing::error!("Failed to request hint: {}", e);
            let msg = e.to_string();
            let status = if msg.contains("Maximum hints limit reached") {
                StatusCode::BAD_REQUEST
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            Err((status, msg))
        }
    }
}
