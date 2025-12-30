use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

mod common;

/// Helper: создать admin пользователя и получить токен
async fn create_admin_with_token(app: &axum::Router) -> (String, String) {
    // Регистрируем пользователя
    let email = format!("admin-groups+{}@test.com", Uuid::new_v4());
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

/// Helper: создать teacher пользователя
async fn create_teacher(
    app: &axum::Router,
    admin_token: &str,
    csrf_token: &str,
    csrf_cookie: &str,
) -> String {
    let create_teacher_body = json!({
        "email": "teacher@test.com",
        "password": "Teacher123!@#",
        "name": "Teacher User",
        "role": "teacher",
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
                .body(Body::from(create_teacher_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    response_json["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_create_group() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    let create_group_body = json!({
        "name": "8A Class",
        "school": "School №1",
        "description": "Test group",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["name"], "8A Class");
    assert_eq!(response_json["school"], "School №1");
    assert_eq!(response_json["description"], "Test group");
    assert_eq!(response_json["student_count"], 0);
    assert!(response_json["id"].is_string());
}

#[tokio::test]
async fn test_create_group_with_curator() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем teacher
    let teacher_id = create_teacher(
        &app,
        &admin_token,
        csrf_token.as_str(),
        csrf_cookie.as_str(),
    )
    .await;

    // Создаем группу с куратором
    let create_group_body = json!({
        "name": "9B Class",
        "school": "School №2",
        "curator_id": teacher_id,
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["name"], "9B Class");
    assert_eq!(response_json["curator_id"], teacher_id);
    assert_eq!(response_json["curator_name"], "Teacher User");
}

#[tokio::test]
async fn test_list_groups() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем несколько групп
    let group1_body = json!({
        "name": "10A Class",
        "school": "School №1",
    });

    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(group1_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let group2_body = json!({
        "name": "11A Class",
        "school": "School №2",
    });

    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(group2_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Получаем список групп
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/groups")
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
    let groups = response_json.as_array().unwrap();
    assert!(groups.len() >= 2);
}

#[tokio::test]
async fn test_get_group_by_id() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем группу
    let create_group_body = json!({
        "name": "Test Group",
        "school": "Test School",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let group_id = response_json["id"].as_str().unwrap();

    // Получаем группу по ID
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/admin/groups/{}", group_id))
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

    assert_eq!(response_json["id"], group_id);
    assert_eq!(response_json["name"], "Test Group");
    assert_eq!(response_json["school"], "Test School");
}

#[tokio::test]
async fn test_update_group() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем группу
    let create_group_body = json!({
        "name": "Old Name",
        "school": "Old School",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let group_id = response_json["id"].as_str().unwrap();

    // Обновляем группу
    let update_body = json!({
        "name": "New Name",
        "school": "New School",
        "description": "Updated description",
    });

    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/admin/groups/{}", group_id))
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(update_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();

    assert_eq!(response_json["name"], "New Name");
    assert_eq!(response_json["school"], "New School");
    assert_eq!(response_json["description"], "Updated description");
}

#[tokio::test]
async fn test_delete_group() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем группу
    let create_group_body = json!({
        "name": "Delete Me",
        "school": "Test School",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    let response_json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    let group_id = response_json["id"].as_str().unwrap();

    // Удаляем группу
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/admin/groups/{}", group_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Проверяем что группа действительно удалена
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/admin/groups/{}", group_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_create_group_without_admin_role_forbidden() {
    let app = common::create_test_app().await;

    // Регистрируем обычного пользователя
    let register_body = json!({
        "email": "student-groups@test.com",
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

    // Пытаемся создать группу под student токеном
    let create_group_body = json!({
        "name": "Hacker Group",
        "school": "Hacker School",
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", student_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Должен вернуть 403 Forbidden
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_export_groups_returns_csv() {
    let app = common::create_test_app().await;
    let (_admin_id, admin_token) = create_admin_with_token(&app).await;
    let (csrf_token, csrf_cookie) = get_csrf_token(&app).await;

    // Создаем хотя бы одну группу
    let create_group_body = json!({
        "name": "CSV Group",
        "school": "Export School",
    });

    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/admin/groups")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", admin_token))
                .header("x-csrf-token", csrf_token.as_str())
                .header("cookie", format!("csrf_token={}", csrf_cookie))
                .body(Body::from(create_group_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/admin/groups/export")
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let csv = String::from_utf8(body.to_vec()).unwrap();
    assert!(
        csv.contains("CSV Group"),
        "export CSV should contain created group: {csv}"
    );
    assert!(
        csv.starts_with("id,name,school"),
        "export CSV should contain header"
    );
}
