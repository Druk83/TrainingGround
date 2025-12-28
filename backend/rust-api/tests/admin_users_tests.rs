use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

/// Helper: создать admin пользователя и получить токен
async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    // Регистрируем пользователя
    let register_body = json!({
        "email": "admin@test.com",
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
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let user_id = response_json["user"]["id"].as_str().unwrap().to_string();

    // Обновляем роль пользователя на admin через MongoDB
    let config = trainingground_api::config::Config::load().unwrap();
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .unwrap();
    let db = mongo_client.database(&config.mongo_database);
    let users_collection = db.collection::<mongodb::bson::Document>("users");

    users_collection
        .update_one(
            mongodb::bson::doc! { "_id": mongodb::bson::oid::ObjectId::parse_str(&user_id).unwrap() },
            mongodb::bson::doc! { "$set": { "role": "admin" } },
        )
        .await
        .unwrap();

    // Логинимся заново чтобы получить токен с ролью admin
    let login_body = json!({
        "email": "admin@test.com",
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
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let access_token = response_json["access_token"].as_str().unwrap().to_string();

    (user_id, access_token)
}

/// Helper: получить CSRF токен и cookie
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

    // Extract CSRF cookie from Set-Cookie header
    let csrf_cookie = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|s| s.starts_with("csrf_token="))
        .map(|s| {
            s.split(';')
                .next()
                .and_then(|part| part.split('=').nth(1))
                .unwrap_or("")
                .to_string()
        })
        .unwrap_or_default();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let csrf_token = response_json["csrf_token"].as_str().unwrap().to_string();

    (csrf_token, csrf_cookie)
}

#[tokio::test]
async fn test_create_user_as_admin() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let create_user_body = json!({
        "email": "newuser@test.com",
        "password": "Test123!@#",
        "name": "New Test User",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["email"], "newuser@test.com");
    assert_eq!(response_json["name"], "New Test User");
    assert_eq!(response_json["role"], "student");
    assert!(response_json["id"].is_string());
}

#[tokio::test]
async fn test_create_user_without_admin_role_forbidden() {
    let app = common::create_test_app().await;

    // Регистрируем обычного пользователя (student)
    let register_body = json!({
        "email": "student@test.com",
        "password": "Student123!@#",
        "name": "Student User",
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
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let student_token = response_json["access_token"].as_str().unwrap().to_string();

    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Пытаемся создать пользователя под student токеном
    let create_user_body = json!({
        "email": "hacker@test.com",
        "password": "Hacker123!@#",
        "name": "Hacker User",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", student_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_list_users() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/users")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert!(response_json.is_array());
    let users = response_json.as_array().unwrap();
    assert!(!users.is_empty());

    let user = &users[0];
    assert!(user["id"].is_string());
    assert!(user["email"].is_string());
    assert!(user["name"].is_string());
    assert!(user["role"].is_string());
}

#[tokio::test]
async fn test_get_user_by_id() {
    let app = common::create_test_app().await;
    let (admin_id, admin_token) = create_admin_with_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/admin/users/{}", admin_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["id"], admin_id);
    assert_eq!(response_json["email"], "admin@test.com");
    assert_eq!(response_json["role"], "admin");
}

#[tokio::test]
async fn test_update_user() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем пользователя
    let create_user_body = json!({
        "email": "updateme@test.com",
        "password": "Test123!@#",
        "name": "Update Me",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let user_id = response_json["id"].as_str().unwrap();

    // Обновляем пользователя
    let (csrf_token2, csrf_cookie2) = get_csrf_token(&app).await;
    let update_body = json!({
        "name": "Updated Name",
        "role": "teacher",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/admin/users/{}", user_id))
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token2)
                .header("cookie", format!("csrf_token={}", csrf_cookie2))
                .body(Body::from(update_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["name"], "Updated Name");
    assert_eq!(response_json["role"], "teacher");
}

#[tokio::test]
async fn test_block_and_unblock_user() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем пользователя
    let create_user_body = json!({
        "email": "blockme@test.com",
        "password": "Test123!@#",
        "name": "Block Me",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let user_id = response_json["id"].as_str().unwrap();

    // Блокируем пользователя
    let (csrf_token2, csrf_cookie2) = get_csrf_token(&app).await;
    let block_body = json!({
        "reason": "Test blocking",
        "duration_hours": 24,
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/users/{}/block", user_id))
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token2)
                .header("cookie", format!("csrf_token={}", csrf_cookie2))
                .body(Body::from(block_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["is_blocked"], true);
    assert_eq!(response_json["block_reason"], "Test blocking");
    assert!(response_json["blocked_until"].is_string());

    // Разблокируем пользователя
    let (csrf_token3, csrf_cookie3) = get_csrf_token(&app).await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/users/{}/unblock", user_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token3)
                .header("cookie", format!("csrf_token={}", csrf_cookie3))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["is_blocked"], false);
    assert!(response_json["blocked_until"].is_null());
    assert!(response_json["block_reason"].is_null());
}

#[tokio::test]
async fn test_delete_user() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем пользователя
    let create_user_body = json!({
        "email": "deleteme@test.com",
        "password": "Test123!@#",
        "name": "Delete Me",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let user_id = response_json["id"].as_str().unwrap();

    // Удаляем пользователя
    let (csrf_token2, csrf_cookie2) = get_csrf_token(&app).await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/admin/users/{}", user_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token2)
                .header("cookie", format!("csrf_token={}", csrf_cookie2))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Проверяем что пользователь действительно удален
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/admin/users/{}", user_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_create_user_with_invalid_email() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let create_user_body = json!({
        "email": "not-an-email",
        "password": "Test123!@#",
        "name": "Test User",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_create_user_with_short_password() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let create_user_body = json!({
        "email": "test@test.com",
        "password": "123",
        "name": "Test User",
        "role": "student",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
