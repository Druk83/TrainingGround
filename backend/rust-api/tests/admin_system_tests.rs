use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use serde_json::json;
use tower::ServiceExt;
use trainingground_api::config::Config;

mod common;

#[tokio::test]
#[serial_test::serial]
async fn test_get_system_metrics_returns_counts() {
    let app = common::create_test_app().await;
    disable_rate_limit();

    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/system/metrics")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(
        response.status().is_success(),
        "unexpected status: {}",
        response.status()
    );

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(
        json["total_users"].as_u64().is_some(),
        "metrics payload missing total_users: {json:?}"
    );
    assert!(
        json["uptime_seconds"].as_u64().unwrap_or_default() > 0,
        "uptime_seconds should be positive"
    );
}

async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    let register_body = json!({
        "email": format!("system-admin-{}@test.com", uuid::Uuid::new_v4()),
        "password": "Admin123!@#",
        "name": "System Admin",
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
            mongodb::bson::doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(user_id).unwrap() },
            mongodb::bson::doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();
}

fn disable_rate_limit() {
    std::env::set_var("RATE_LIMIT_DISABLED", "1");
}
