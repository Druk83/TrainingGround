use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

#[tokio::test]
async fn test_list_backups_returns_data() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/backups")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_create_backup_returns_record() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/backups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(
                    json!({ "label": "Integration test backup" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "Completed");
}

#[tokio::test]
async fn test_restore_backup_returns_message() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/backups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(json!({ "label": "restore-me" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let backup_id = json["id"].as_str().expect("backup id missing").to_string();

    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let restore_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/backups/{}/restore", backup_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(restore_response.status(), StatusCode::OK);
    let restore_body = to_bytes(restore_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let restore_json: serde_json::Value = serde_json::from_slice(&restore_body).unwrap();
    assert!(
        restore_json["message"]
            .as_str()
            .unwrap_or_default()
            .contains("restore"),
        "restore response should contain info message"
    );
}

async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    let register_body = json!({
        "email": "backup-admin@test.com",
        "password": "Admin123!@#",
        "name": "Backup Admin",
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
    promote_user_to_admin(&user_id).await;

    let login_body = json!({
        "email": json["user"]["email"].as_str().unwrap(),
        "password": "Admin123!@#",
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

async fn promote_user_to_admin(user_id: &str) {
    let config = trainingground_api::config::Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    mongo_client
        .database(&config.mongo_database)
        .collection::<mongodb::bson::Document>("users")
        .update_one(
            mongodb::bson::doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(user_id).unwrap() },
            mongodb::bson::doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();
}
