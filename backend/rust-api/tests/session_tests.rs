use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

#[tokio::test]
async fn test_health_check() {
    let app = common::create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();

    assert!(body_str.contains("healthy"));
    assert!(body_str.contains("trainingground-api"));
}

#[tokio::test]
async fn test_create_session() {
    let app = common::create_test_app().await;

    let request_body = json!({
        "user_id": "test-user-123",
        "task_id": "test-task-456",
        "group_id": null
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("content-type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();

    if status != StatusCode::CREATED {
        eprintln!("Response status: {}", status);
        eprintln!("Response body: {}", body_str);
    }

    assert_eq!(status, StatusCode::CREATED);

    let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(response_json["session_id"].is_string());
    assert_eq!(response_json["task"]["id"], "test-task-456");
}

#[tokio::test]
async fn test_get_session_not_found() {
    let app = common::create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/sessions/nonexistent-session-id")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_session_lifecycle() {
    let app = common::create_test_app().await;

    // 1. Create session
    let create_body = json!({
        "user_id": "lifecycle-user",
        "task_id": "lifecycle-task",
        "group_id": null
    });

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/sessions")
                .header("content-type", "application/json")
                .body(Body::from(create_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(create_response.status(), StatusCode::CREATED);

    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let create_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let session_id = create_json["session_id"].as_str().unwrap();

    // 2. Get session
    let get_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/sessions/{}", session_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(get_response.status(), StatusCode::OK);

    let get_body = to_bytes(get_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let get_json: serde_json::Value = serde_json::from_slice(&get_body).unwrap();

    assert_eq!(get_json["id"], session_id);
    assert_eq!(get_json["user_id"], "lifecycle-user");
    assert_eq!(get_json["status"], "active");

    // 3. Complete session
    let complete_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/complete", session_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(complete_response.status(), StatusCode::NO_CONTENT);

    // 4. Verify session is deleted
    let verify_response = app
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/sessions/{}", session_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(verify_response.status(), StatusCode::NOT_FOUND);
}
