use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

mod common;

/// Helper: создать admin пользователя и получить токен
async fn create_admin_with_token(app: &axum::Router) -> (String, String, String) {
    // Регистрируем пользователя с уникальным email, чтобы тесты не конфликтовали
    let email = format!("admin-{}@test.com", Uuid::new_v4());
    let register_body = json!({
        "email": email.clone(),
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
        "email": email,
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

    (user_id, access_token, email)
}

async fn create_student_token(app: &axum::Router) -> String {
    let email = format!("student-{}@test.com", Uuid::new_v4());
    let register_body = json!({
        "email": email,
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
    assert_eq!(response.status(), StatusCode::CREATED);

    let login_body = json!({
        "email": email,
        "password": "Student123!@#",
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
    let login_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    login_json["access_token"].as_str().unwrap().to_string()
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

struct TestUser {
    id: String,
    email: String,
}

async fn admin_create_user(
    app: &axum::Router,
    admin_token: &str,
    csrf_token: &str,
    csrf_cookie: &str,
    email_override: Option<String>,
) -> TestUser {
    let email = email_override.unwrap_or_else(|| format!("bulk-user-{}@test.com", Uuid::new_v4()));
    let create_user_body = json!({
        "email": email,
        "password": "Bulk123!@#",
        "name": "Bulk User",
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
                .header("x-csrf-token", csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_user_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    TestUser {
        id: json["id"].as_str().unwrap().to_string(),
        email,
    }
}

async fn admin_create_group(
    app: &axum::Router,
    admin_token: &str,
    csrf_token: &str,
    csrf_cookie: &str,
) -> String {
    let create_group_body = json!({
        "name": format!("Bulk Group {}", Uuid::new_v4()),
        "school": "Bulk School",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    json["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_create_user_as_admin() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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
async fn test_bulk_assign_groups() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let user1 = admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, None).await;
    let user2 = admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, None).await;
    let group_id = admin_create_group(&app, &admin_token, &csrf_token, &csrf_cookie).await;

    let bulk_body = json!({
        "user_ids": [user1.id.clone(), user2.id.clone()],
        "operation": {
            "type": "set_groups",
            "group_ids": [group_id]
        }
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users/bulk")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(bulk_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["processed"], 2);

    for user_id in [&user1.id, &user2.id] {
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

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let user_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let groups = user_json["group_ids"].as_array().unwrap();
        assert!(
            groups.iter().any(|value| value.as_str() == Some(&group_id)),
            "user should contain assigned group"
        );
    }
}

#[tokio::test]
async fn test_reset_password_endpoint_returns_temp_password_when_email_disabled() {
    std::env::set_var("EMAIL_SEND_DISABLED", "1");
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let created_user = admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, None).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/admin/users/{}/reset-password", created_user.id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let temp_password = json["temporary_password"]
        .as_str()
        .expect("temporary password returned");

    // Пользователь может войти с новым паролем
    let login_body = json!({
        "email": created_user.email,
        "password": temp_password,
    });

    let login_response = app
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
    assert_eq!(login_response.status(), StatusCode::OK);

    std::env::remove_var("EMAIL_SEND_DISABLED");
}

#[tokio::test]
async fn test_bulk_block_users() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let user1 = admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, None).await;
    let user2 = admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, None).await;

    let bulk_body = json!({
        "user_ids": [user1.id.clone(), user2.id.clone()],
        "operation": {
            "type": "block",
            "reason": "Bulk moderation",
            "duration_hours": 2
        }
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/users/bulk")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", &csrf_token)
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(bulk_body.to_string()))
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
    assert_eq!(json["processed"], 2);
    assert!(json["failed"].as_array().unwrap().is_empty());

    for user_id in [&user1.id, &user2.id] {
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
        assert!(response.status().is_success());
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let user_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(user_json["is_blocked"].as_bool().unwrap());
    }
}

#[tokio::test]
async fn test_list_users() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;

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
    let (admin_id, admin_token, admin_email) = create_admin_with_token(&app).await;

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
    assert_eq!(response_json["email"], admin_email);
    assert_eq!(response_json["role"], "admin");
}

#[tokio::test]
async fn test_update_user() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
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

#[tokio::test]
async fn test_student_forbidden_from_admin_routes() {
    let app = common::create_test_app().await;
    let token = create_student_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/users")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_list_users_with_pagination() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token, _) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let mut created = Vec::new();
    let email_base = format!("bulk-page-{}", Uuid::new_v4());
    for idx in 0..3 {
        let email = format!("{email_base}-{idx}@test.com");
        created.push(
            admin_create_user(&app, &admin_token, &csrf_token, &csrf_cookie, Some(email))
                .await
                .id,
        );
    }

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/admin/users?search={}&limit=2&offset=1",
                    email_base
                ))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let users: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert_eq!(users.len(), 2);
    let returned_ids: Vec<String> = users
        .iter()
        .map(|u| u["id"].as_str().unwrap().to_string())
        .collect();
    assert!(returned_ids.iter().all(|id| created.contains(id)));
}

async fn seed_bulk_users(admin_id: &str, count: usize) {
    use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
    use trainingground_api::config::Config;

    let config = Config::load().expect("config");
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .expect("mongo");
    let db = mongo_client.database(&config.mongo_database);
    let users_collection = db.collection::<mongodb::bson::Document>("users");
    let admin_oid = ObjectId::parse_str(admin_id).unwrap();
    users_collection
        .delete_many(mongodb::bson::doc! { "_id": { "$ne": admin_oid } })
        .await
        .expect("cleanup users");

    let mut batch = Vec::new();
    for idx in 0..count {
        batch.push(mongodb::bson::doc! {
            "email": format!("load-{idx}@example.com"),
            "password_hash": "hash",
            "name": format!("Load Test {idx}"),
            "role": "student",
            "group_ids": [],
            "is_blocked": false,
            "createdAt": BsonDateTime::now(),
            "updatedAt": BsonDateTime::now(),
        });
        if batch.len() == 200 {
            users_collection
                .insert_many(std::mem::take(&mut batch))
                .await
                .expect("insert batch");
        }
    }
    if !batch.is_empty() {
        users_collection
            .insert_many(batch)
            .await
            .expect("insert remainder");
    }
}

#[tokio::test]
async fn test_list_users_handles_large_dataset() {
    let app = common::create_test_app().await;
    let (admin_id, admin_token, _) = create_admin_with_token(&app).await;
    seed_bulk_users(&admin_id, 1000).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/users?limit=100&offset=900")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let users: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert_eq!(users.len(), 100);
    assert!(users.iter().all(|user| {
        user["email"]
            .as_str()
            .map(|email| email.starts_with("load-"))
            .unwrap_or(false)
    }));
}
