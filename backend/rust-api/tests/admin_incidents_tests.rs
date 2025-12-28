use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use chrono::Utc;
use mongodb::bson::{doc, to_document};
use serde_json::json;
use tower::ServiceExt;
use trainingground_api::{
    config::Config,
    models::anticheat::{
        ActionTaken, IncidentDetails, IncidentRecord, IncidentSeverity, IncidentStatus,
        IncidentType,
    },
};
use uuid::Uuid;

mod common;

#[tokio::test]
async fn test_list_incidents_returns_results() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let test_user_id = create_test_user(&app, &admin_token, &csrf_token, &csrf_cookie).await;
    let incident_id = insert_incident(&test_user_id, IncidentStatus::Open).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/incidents")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert!(
        json.as_array()
            .expect("response array")
            .iter()
            .any(|item| item["incident"]["id"] == incident_id),
        "incident not found in list response"
    );
}

#[tokio::test]
async fn test_get_incident_by_id() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let test_user_id = create_test_user(&app, &admin_token, &csrf_token, &csrf_cookie).await;
    let incident_id = insert_incident(&test_user_id, IncidentStatus::Open).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/admin/incidents/{}", incident_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["incident"]["id"], incident_id);
}

#[tokio::test]
async fn test_update_incident_status() {
    let app = common::create_test_app().await;
    let (admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let test_user_id = create_test_user(&app, &admin_token, &csrf_token, &csrf_cookie).await;
    let incident_id = insert_incident(&test_user_id, IncidentStatus::Open).await;

    let (csrf_token_update, csrf_cookie_update) = get_csrf_token(&app).await;
    let payload = json!({
        "action": "resolve",
        "note": "Checked by admin"
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/admin/incidents/{}", incident_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token_update)
                .header("cookie", format!("csrf_token={}", csrf_cookie_update))
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["incident"]["status"], "resolved");
    assert_eq!(json["incident"]["resolved_by"], admin_id);
}

#[tokio::test]
async fn test_unblock_user_via_incident() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let test_user_id = create_test_user(&app, &admin_token, &csrf_token, &csrf_cookie).await;
    let incident_id = insert_incident(&test_user_id, IncidentStatus::Open).await;

    // Block the user first
    let (csrf_token_block, csrf_cookie_block) = get_csrf_token(&app).await;
    let block_body = json!({
        "reason": "Suspicious activity",
        "duration_hours": 2
    });
    let block_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/users/{}/block", test_user_id))
                .header("authorization", format!("Bearer {}", admin_token.clone()))
                .header("x-csrf-token", &csrf_token_block)
                .header("cookie", format!("csrf_token={}", csrf_cookie_block))
                .header("content-type", "application/json")
                .body(Body::from(block_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(block_response.status(), StatusCode::OK);

    let (csrf_token_unblock, csrf_cookie_unblock) = get_csrf_token(&app).await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/incidents/{}/unblock", incident_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token_unblock)
                .header("cookie", format!("csrf_token={}", csrf_cookie_unblock))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["id"], test_user_id);
    assert_eq!(json["is_blocked"], false);
}

async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    let email = format!("admin-incidents-{}@test.com", Uuid::new_v4());
    let register_body = json!({
        "email": email,
        "password": "Admin123!@#",
        "name": "Admin User",
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

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let register_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let user_id = register_json["user"]["id"].as_str().unwrap().to_string();

    let config = Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    let db = mongo_client.database(&config.mongo_database);
    let users_collection = db.collection::<mongodb::bson::Document>("users");

    users_collection
        .update_one(
            doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(&user_id).unwrap() },
            doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();

    let login_body = json!({
        "email": register_json["user"]["email"].as_str().unwrap(),
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

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let login_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let access_token = login_json["access_token"].as_str().unwrap().to_string();

    (user_id, access_token)
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

async fn create_test_user(
    app: &axum::Router,
    admin_token: &str,
    csrf_token: &str,
    csrf_cookie: &str,
) -> String {
    let email = format!("suspect-{}@test.com", Uuid::new_v4());
    let create_user_body = json!({
        "email": email,
        "password": "Test123!@#",
        "name": "Suspicious User",
        "role": "student"
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    json["id"].as_str().unwrap().to_string()
}

async fn insert_incident(user_id: &str, status: IncidentStatus) -> String {
    let config = Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    let db = mongo_client.database(&config.mongo_database);
    let collection = db.collection::<mongodb::bson::Document>("incidents");

    let incident = IncidentRecord {
        id: Uuid::new_v4().to_string(),
        user_id: user_id.to_string(),
        incident_type: IncidentType::SpeedViolation,
        severity: IncidentSeverity::Medium,
        details: IncidentDetails {
            speed_hits: Some(15),
            repeated_hits: None,
            time_window_seconds: Some(3600),
            additional_info: Some("Test incident".into()),
        },
        timestamp: Utc::now(),
        action_taken: ActionTaken::Flagged,
        status,
        resolved_by: None,
        resolved_at: None,
        resolution_note: None,
    };

    let doc = to_document(&incident).expect("serialize incident");
    collection.insert_one(doc).await.unwrap();
    incident.id
}
