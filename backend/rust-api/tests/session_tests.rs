use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

mod common;

#[tokio::test]
async fn test_create_session_uses_task_from_db() {
    disable_rate_limit();
    let app = common::create_test_app().await;

    let (user_id, token) = create_user_and_login(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let body = json!({
        "user_id": user_id,
        "task_id": "test-task",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions/")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    if status != StatusCode::CREATED {
        panic!(
            "unexpected status {} body {}",
            status,
            String::from_utf8_lossy(&body)
        );
    }

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["task"]["id"], "test-task");
    assert_eq!(json["task"]["title"], "Test Task");
    assert_eq!(
        json["task"]["description"],
        "A test task for integration tests"
    );
    assert_eq!(json["task"]["time_limit_seconds"], 300);
}

#[tokio::test]
async fn test_create_session_unknown_task_returns_404() {
    disable_rate_limit();
    let app = common::create_test_app().await;
    let (user_id, token) = create_user_and_login(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let body = json!({
        "user_id": user_id,
        "task_id": "missing-task-id",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions/")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

async fn create_user_and_login(app: &axum::Router) -> (String, String) {
    let email = format!("session-user-{}@test.com", Uuid::new_v4());
    let register_body = json!({
        "email": email,
        "password": "Session123!@#",
        "name": "Session User",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(register_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let user_id = json["user"]["id"].as_str().unwrap().to_string();

    let login_body = json!({
        "email": email,
        "password": "Session123!@#",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(login_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let token = json["access_token"].as_str().unwrap().to_string();

    (user_id, token)
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
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let csrf_token = json["csrf_token"].as_str().unwrap().to_string();

    (csrf_token, csrf_cookie)
}

fn disable_rate_limit() {
    std::env::set_var("RATE_LIMIT_DISABLED", "1");
}
