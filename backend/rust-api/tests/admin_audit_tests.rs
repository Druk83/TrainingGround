use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use mongodb::bson::doc;
use serde_json::json;
use tower::ServiceExt;
use trainingground_api::{
    config::Config,
    models::audit_log::{AuditEventType, AuditLog},
};

mod common;

#[tokio::test]
#[serial_test::serial]
async fn test_list_audit_logs_returns_entries() {
    let app = common::create_test_app().await;
    disable_rate_limit();
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    insert_audit_log(AuditEventType::CreateUser).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/audit?limit=10")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(!json.as_array().unwrap().is_empty());
}

#[tokio::test]
#[serial_test::serial]
async fn test_export_audit_logs_returns_csv() {
    let app = common::create_test_app().await;
    disable_rate_limit();
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    insert_audit_log(AuditEventType::BlockUser).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/audit/export")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let csv = String::from_utf8(body.to_vec()).unwrap();
    assert!(csv.contains("event_type"));
    assert!(csv.contains("block_user"));
}

async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    let register_body = json!({
        "email": format!("audit-admin-{}@test.com", uuid::Uuid::new_v4()),
        "password": "Admin123!@#",
        "name": "Audit Admin",
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

async fn promote_user_to_admin(user_id: &str) {
    let config = Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    mongo_client
        .database(&config.mongo_database)
        .collection::<mongodb::bson::Document>("users")
        .update_one(
            doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(user_id).unwrap() },
            doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();
}

async fn insert_audit_log(event: AuditEventType) {
    let config = Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    let collection = mongo_client
        .database(&config.mongo_database)
        .collection::<AuditLog>("audit_log");
    let log = AuditLog {
        id: None,
        event_type: event,
        user_id: Some("user123".into()),
        email: Some("user@example.com".into()),
        success: true,
        ip: Some("127.0.0.1".into()),
        user_agent: Some("test-agent".into()),
        details: Some("test entry".into()),
        error_message: None,
        created_at: chrono::Utc::now(),
    };
    collection.insert_one(log).await.unwrap();
}

fn disable_rate_limit() {
    std::env::set_var("RATE_LIMIT_DISABLED", "1");
}
