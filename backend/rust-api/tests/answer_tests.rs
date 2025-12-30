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
async fn test_submit_correct_answer() {
    let app = common::create_test_app().await;
    let user_id = format!("test-user-{}", Uuid::new_v4());

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

    let status = create_response.status();
    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(status, StatusCode::CREATED);
    let session_id = json["session_id"].as_str().unwrap();

    // Submit correct answer
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let answer_response = app
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
                        "idempotency_key": format!("{}:test-task:1", session_id)
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(answer_response.status(), StatusCode::OK);

    let body = to_bytes(answer_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify S1 rule: +10 points for correct answer
    assert_eq!(json["correct"], true);
    assert_eq!(json["score_awarded"], 10);
    assert_eq!(json["combo_bonus"], 0); // No combo yet
    assert_eq!(json["current_streak"], 1);
    assert_eq!(json["total_score"], 10);
}

#[tokio::test]
async fn test_submit_incorrect_answer() {
    let app = common::create_test_app().await;
    let user_id = format!("test-user-{}", Uuid::new_v4());

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

    // Submit incorrect answer
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let answer_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/v1/sessions/{}/answers", session_id))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    serde_json::to_string(&json!({
                        "answer": "wrong",
                        "idempotency_key": format!("{}:test-task:1", session_id)
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(answer_response.status(), StatusCode::OK);

    let body = to_bytes(answer_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Verify S2 rule: 0 points for incorrect answer
    assert_eq!(json["correct"], false);
    assert_eq!(json["score_awarded"], 0);
    assert_eq!(json["combo_bonus"], 0);
    assert_eq!(json["current_streak"], 0);
    assert_eq!(json["total_score"], 0);
}

#[tokio::test]
async fn test_combo_bonus() {
    let app = common::create_test_app().await;
    let user_id = format!("combo-user-{}", Uuid::new_v4());

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

    // Submit 3 correct answers to build streak
    for i in 1..=3 {
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
                            "idempotency_key": format!("{}:test-task:{}", session_id, i)
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["correct"], true);
        assert_eq!(json["current_streak"], i);

        if i < 3 {
            // No combo bonus yet
            assert_eq!(json["combo_bonus"], 0);
        } else {
            // S4 rule: +5 combo bonus after streak >= 3
            assert_eq!(json["combo_bonus"], 5);
        }
    }

    // 4th answer should also have combo bonus
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let response = app
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
                        "idempotency_key": format!("{}:test-task:4", session_id)
                    }))
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["current_streak"], 4);
    assert_eq!(json["combo_bonus"], 5);
    assert_eq!(json["total_score"], 10 + 10 + 15 + 15); // 10+10+15(combo)+15(combo) = 50
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
