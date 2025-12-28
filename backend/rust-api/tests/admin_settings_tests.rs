use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use mongodb::bson::doc;
use serde_json::{json, Value};
use tower::ServiceExt;

mod common;

#[tokio::test]
#[serial_test::serial]
async fn test_get_settings_empty() {
    let app = common::create_test_app().await;
    set_rate_limit_disabled();
    clear_system_settings().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/settings")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json = json_from_bytes(&body);
    assert!(json["yandexgpt"].is_null());
    assert!(json["sso"].is_null());
}

#[tokio::test]
#[serial_test::serial]
async fn test_update_yandexgpt_settings() {
    let app = common::create_test_app().await;
    set_rate_limit_disabled();
    clear_system_settings().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let payload = json!({
        "api_key": "test-key",
        "folder_id": "folder",
        "model": "yandexgpt-lite",
        "temperature": 0.4,
        "max_tokens": 256
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/admin/settings/yandexgpt")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("content-type", "application/json")
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let get_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/settings")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = to_bytes(get_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json = json_from_bytes(&body);
    assert_eq!(json["yandexgpt"]["api_key"], "test-key");
    assert_eq!(json["yandexgpt"]["model"], "yandexgpt-lite");
}

#[tokio::test]
#[serial_test::serial]
async fn test_test_email_endpoint() {
    let app = common::create_test_app().await;
    set_rate_limit_disabled();
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/settings/test/email")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    let body = json!({
        "email": format!("settings-admin-{}@test.com", uuid::Uuid::new_v4()),
        "password": "Admin123!@#",
        "name": "Admin Settings",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json = json_from_bytes(&bytes);
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
    let json = json_from_bytes(&bytes);
    let token = json["access_token"].as_str().unwrap().to_string();

    (user_id, token)
}

async fn promote_user_to_admin(user_id: &str) {
    let config = trainingground_api::config::Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    let db = mongo_client.database(&config.mongo_database);
    let collection = db.collection::<mongodb::bson::Document>("users");
    collection
        .update_one(
            doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(user_id).unwrap() },
            doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();
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
        .find(|h| h.starts_with("csrf_token="))
        .and_then(|pair| pair.split(';').next())
        .and_then(|part| part.split('=').nth(1))
        .unwrap_or("")
        .to_string();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json = json_from_bytes(&body);
    let csrf_token = json["csrf_token"].as_str().unwrap().to_string();
    (csrf_token, csrf_cookie)
}

fn json_from_bytes(bytes: &[u8]) -> Value {
    let body_str = std::str::from_utf8(bytes).unwrap();
    serde_json::from_str(body_str).unwrap()
}

fn set_rate_limit_disabled() {
    std::env::set_var("RATE_LIMIT_DISABLED", "1");
}

async fn clear_system_settings() {
    let config = trainingground_api::config::Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    mongo_client
        .database(&config.mongo_database)
        .collection::<mongodb::bson::Document>("system_settings")
        .delete_many(doc! {})
        .await
        .unwrap();
}
