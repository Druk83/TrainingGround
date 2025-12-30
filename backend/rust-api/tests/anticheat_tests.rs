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
async fn test_normal_usage_not_flagged() {
    let app = common::create_test_app().await;
    let user_id = format!("normal-user-{}", Uuid::new_v4());

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

    // Submit 3 answers (under threshold)
    for _ in 0..3 {
        let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
        let response = app
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

        // Should succeed - under threshold
        assert_eq!(response.status(), StatusCode::OK);
    }
}

#[tokio::test]
async fn test_speed_violation_detection() {
    let app = common::create_test_app().await;
    let user_id = format!("speed-violator-{}", Uuid::new_v4());

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

    // Submit 11 answers rapidly (exceeds threshold of 10)
    for i in 1..=11 {
        let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
        let response = app
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
                            "answer": format!("answer-{}", i),
                            "idempotency_key": format!("{}:test-task:speed-{}", session_id, i)
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        if i <= 10 {
            // First 10 should succeed (threshold is >10)
            assert_eq!(response.status(), StatusCode::OK);
        } else {
            // 11th should be blocked
            assert!(
                response.status().is_server_error() || response.status().is_client_error(),
                "Expected error status for blocked user, got {}",
                response.status()
            );
        }
    }
}

#[tokio::test]
async fn test_repeated_answers_detection() {
    let app = common::create_test_app().await;
    let user_id = format!("repeater-{}", Uuid::new_v4());

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

    // Submit same answer 9 times (exceeds threshold of 8)
    for i in 1..=9 {
        let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
        let response = app
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
                            "answer": "same-answer",
                            "idempotency_key": format!("{}:test-task:repeat-{}", session_id, i)
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        if i <= 8 {
            // First 8 should succeed
            assert_eq!(response.status(), StatusCode::OK);
        } else {
            // 9th should be blocked
            assert!(
                response.status().is_server_error() || response.status().is_client_error(),
                "Expected error status for blocked user due to repeated answers"
            );
        }
    }
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
