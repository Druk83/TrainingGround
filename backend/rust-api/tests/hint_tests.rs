mod common;

use axum::body::to_bytes;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn test_request_hint_success() {
    let app = common::create_test_app().await;
    let user_id = format!("hint-user-{}", Uuid::new_v4());

    println!("Creating session for user: {}", user_id);

    // Create session first
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "user_id": user_id,
                        "task_id": "test-task",
                        "group_id": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let session_id = json["session_id"].as_str().unwrap();

    // First, add some score so we can deduct hint cost
    // (In real scenario, user would earn points first)

    // Request first hint
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let hint_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/hints", session_id))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "idempotency_key": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = hint_response.status();
    let body = to_bytes(hint_response.into_body(), usize::MAX)
        .await
        .unwrap();

    if !status.is_success() {
        let error_msg = String::from_utf8_lossy(&body);
        panic!("Hint request failed with status {}: {}", status, error_msg);
    }

    assert_eq!(status, StatusCode::OK);

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify response structure
    assert!(json["hint_text"].is_string());
    assert_eq!(json["hints_used"], 1);
    assert_eq!(json["hints_remaining"], 1);
    assert_eq!(json["cost"], 5);
    assert_eq!(json["new_score"], -5); // Started from 0, deducted 5
}

#[tokio::test]
async fn test_hint_limit_enforcement() {
    let app = common::create_test_app().await;
    let user_id = format!("hint-limit-user-{}", Uuid::new_v4());

    // Create session
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "user_id": user_id,
                        "task_id": "test-task",
                        "group_id": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let session_id = json["session_id"].as_str().unwrap().to_string();

    // Request 2 hints (should succeed)
    for i in 1..=2 {
        let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/sessions/{}/hints", session_id))
                    .header("content-type", "application/json")
                    .header("x-csrf-token", &csrf_token)
                    .header("cookie", format!("csrf_token={}", csrf_cookie))
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "idempotency_key": null
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["hints_used"], i);
        assert_eq!(json["hints_remaining"], 2 - i);
    }

    // Request 3rd hint (should fail - limit exceeded)
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/hints", session_id))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "idempotency_key": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return error (500 or 400)
    assert!(response.status().is_client_error() || response.status().is_server_error());
}

#[tokio::test]
async fn test_hint_cost_deduction() {
    let app = common::create_test_app().await;
    let user_id = format!("hint-cost-user-{}", Uuid::new_v4());

    // Create session
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "user_id": user_id,
                        "task_id": "test-task",
                        "group_id": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let session_id = json["session_id"].as_str().unwrap();

    // Submit correct answer to earn points
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let answer_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/answers", session_id))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "answer": "42",
                        "idempotency_key": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(answer_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let score_before = json["total_score"].as_i64().unwrap();

    // Request hint
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let hint_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/hints", session_id))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "idempotency_key": null
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(hint_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify hint cost was deducted (Rule S3: -5)
    let new_score = json["new_score"].as_i64().unwrap();
    assert_eq!(new_score, score_before - 5);
}

async fn get_csrf_token(app: &axum::Router) -> (String, String) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/auth/csrf-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let csrf_cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|header| header.starts_with("csrf_token="))
        .and_then(|header| header.split(';').next())
        .and_then(|pair| pair.split('=').nth(1))
        .unwrap_or("")
        .to_string();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let csrf_token = json["csrf_token"].as_str().unwrap().to_string();

    (csrf_token, csrf_cookie)
}
