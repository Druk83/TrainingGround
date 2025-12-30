use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

/// Test helper to register a new user
async fn register_user(
    app: &axum::Router,
    email: &str,
    password: &str,
    name: &str,
) -> (StatusCode, String, Vec<String>) {
    let request_body = json!({
        "email": email,
        "password": password,
        "name": name,
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();

    // Extract cookies from Set-Cookie headers
    let cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();

    (status, body_str, cookies)
}

/// Test helper to login a user
async fn login_user(
    app: &axum::Router,
    email: &str,
    password: &str,
) -> (StatusCode, String, Vec<String>) {
    let request_body = json!({
        "email": email,
        "password": password,
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();

    let cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();

    (status, body_str, cookies)
}

/// Extract access_token from JSON response
fn extract_access_token(json_str: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json_str).ok()?;
    value["access_token"].as_str().map(|s| s.to_string())
}

/// Extract refresh_token cookie value
fn extract_refresh_token_cookie(cookies: &[String]) -> Option<String> {
    for cookie in cookies {
        if cookie.starts_with("refresh_token=") {
            // Parse cookie value (format: "refresh_token=VALUE; Path=/api/v1/auth; HttpOnly; ...")
            let parts: Vec<&str> = cookie.split(';').collect();
            if let Some(first) = parts.first() {
                if let Some(value) = first.strip_prefix("refresh_token=") {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

async fn fetch_csrf_token(app: &axum::Router) -> (String, String) {
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
        .find(|c| c.starts_with("csrf_token="))
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

#[tokio::test]
async fn test_register_success() {
    let app = common::create_test_app().await;

    let email = format!(
        "test-register-{}@example.com",
        chrono::Utc::now().timestamp()
    );
    let (status, body, cookies) =
        register_user(&app, &email, "SecurePassword123!", "Test User").await;

    assert_eq!(status, StatusCode::CREATED);

    // Verify JSON response contains access_token and user
    let json: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(json["access_token"].is_string());
    assert_eq!(json["user"]["email"], email);
    assert_eq!(json["user"]["name"], "Test User");
    assert_eq!(json["user"]["role"], "student"); // Default role

    // Verify refresh_token is in HTTP-only cookie
    let refresh_token = extract_refresh_token_cookie(&cookies);
    assert!(refresh_token.is_some(), "refresh_token cookie not found");

    // Verify cookie has correct attributes
    let cookie_str = cookies
        .iter()
        .find(|c| c.starts_with("refresh_token="))
        .unwrap();
    assert!(cookie_str.contains("HttpOnly"), "Cookie should be HttpOnly");
    assert!(cookie_str.contains("Secure"), "Cookie should be Secure");
    assert!(
        cookie_str.contains("SameSite=Strict"),
        "Cookie should have SameSite=Strict"
    );
    assert!(
        cookie_str.contains("Path=/api/v1/auth"),
        "Cookie path should be /api/v1/auth"
    );
}

#[tokio::test]
async fn test_register_duplicate_email() {
    let app = common::create_test_app().await;

    let email = format!(
        "test-duplicate-{}@example.com",
        chrono::Utc::now().timestamp()
    );

    // First registration should succeed
    let (status, _, _) = register_user(&app, &email, "Password123!", "User 1").await;
    assert_eq!(status, StatusCode::CREATED);

    // Second registration with same email should fail
    let (status, body, _) = register_user(&app, &email, "Password456!", "User 2").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body.contains("already exists") || body.contains("duplicate"));
}

#[tokio::test]
async fn test_register_invalid_email() {
    let app = common::create_test_app().await;

    let request_body = json!({
        "email": "invalid-email",
        "password": "SecurePassword123!",
        "name": "Test User",
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.contains("email") || body_str.contains("Validation"));
}

#[tokio::test]
async fn test_login_success() {
    let app = common::create_test_app().await;

    let email = format!("test-login-{}@example.com", chrono::Utc::now().timestamp());
    let password = "SecurePassword123!";

    // Register user first
    let (status, _, _) = register_user(&app, &email, password, "Login Test").await;
    assert_eq!(status, StatusCode::CREATED);

    // Login
    let (status, body, cookies) = login_user(&app, &email, password).await;
    assert_eq!(status, StatusCode::OK);

    // Verify response
    let json: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(json["access_token"].is_string());
    assert_eq!(json["user"]["email"], email);

    // Verify refresh_token cookie
    let refresh_token = extract_refresh_token_cookie(&cookies);
    assert!(refresh_token.is_some());
}

#[tokio::test]
async fn test_login_wrong_password() {
    let app = common::create_test_app().await;

    let email = format!(
        "test-wrong-pwd-{}@example.com",
        chrono::Utc::now().timestamp()
    );

    // Register user
    let (status, _, _) = register_user(&app, &email, "CorrectPassword123!", "Wrong Pwd Test").await;
    assert_eq!(status, StatusCode::CREATED);

    // Try to login with wrong password
    let (status, body, _) = login_user(&app, &email, "WrongPassword123!").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(body.contains("Invalid") || body.contains("password"));
}

#[tokio::test]
async fn test_login_nonexistent_user() {
    let app = common::create_test_app().await;

    let email = format!("nonexistent-{}@example.com", chrono::Utc::now().timestamp());
    let (status, _, _) = login_user(&app, &email, "SomePassword123!").await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_refresh_token_flow() {
    let app = common::create_test_app().await;

    let email = format!(
        "test-refresh-{}@example.com",
        chrono::Utc::now().timestamp()
    );
    let password = "SecurePassword123!";

    // Register and get tokens
    let (_, _, cookies) = register_user(&app, &email, password, "Refresh Test").await;
    let refresh_token_cookie = cookies
        .iter()
        .find(|c| c.starts_with("refresh_token="))
        .expect("refresh_token cookie not found");

    // Call refresh endpoint with cookie
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/refresh")
                .header("cookie", refresh_token_cookie.clone())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();

    assert_eq!(status, StatusCode::OK);

    // Verify new access_token is returned
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert!(json["access_token"].is_string());
    assert!(!json["access_token"].as_str().unwrap().is_empty());
}

#[tokio::test]
async fn test_refresh_without_cookie() {
    let app = common::create_test_app().await;

    // Call refresh without cookie
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/refresh")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_logout() {
    let app = common::create_test_app().await;

    let email = format!("test-logout-{}@example.com", chrono::Utc::now().timestamp());
    let password = "SecurePassword123!";

    // Register and login
    let (_, body, cookies) = register_user(&app, &email, password, "Logout Test").await;
    let access_token = extract_access_token(&body).expect("access_token not found");
    let refresh_cookie = cookies
        .iter()
        .find(|c| c.starts_with("refresh_token="))
        .and_then(|c| c.split(';').next())
        .map(|v| v.to_string())
        .expect("refresh_token cookie missing");

    // Logout
    let (csrf_token, csrf_cookie) = fetch_csrf_token(&app).await;
    let cookie_header = format!("csrf_token={}; {}", csrf_cookie, refresh_cookie);
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/logout")
                .header(header::AUTHORIZATION, format!("Bearer {}", access_token))
                .header("x-csrf-token", &csrf_token)
                .header(header::COOKIE, cookie_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    assert_eq!(status, StatusCode::NO_CONTENT);

    // Verify refresh_token cookie is cleared (max-age=0)
    let cookie_cleared = cookies
        .iter()
        .any(|c| c.starts_with("refresh_token=") && (c.contains("Max-Age=0") || c.is_empty()));
    assert!(
        cookie_cleared,
        "refresh_token cookie should be cleared on logout"
    );
}

#[tokio::test]
async fn test_get_current_user() {
    let app = common::create_test_app().await;

    let email = format!("test-me-{}@example.com", chrono::Utc::now().timestamp());
    let password = "SecurePassword123!";

    // Register
    let (_, body, _) = register_user(&app, &email, password, "Me Test").await;
    let access_token = extract_access_token(&body).expect("access_token not found");

    // Get current user
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .header(header::AUTHORIZATION, format!("Bearer {}", access_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value =
        serde_json::from_str(std::str::from_utf8(&body).unwrap()).unwrap();

    assert_eq!(json["email"], email);
    assert_eq!(json["name"], "Me Test");
}

#[tokio::test]
async fn test_get_current_user_without_token() {
    let app = common::create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_failed_login_rate_limiting() {
    let app = common::create_test_app().await;

    let email = format!(
        "test-rate-limit-{}@example.com",
        chrono::Utc::now().timestamp()
    );

    // Register user
    let (status, _, _) =
        register_user(&app, &email, "CorrectPassword123!", "Rate Limit Test").await;
    assert_eq!(status, StatusCode::CREATED);

    // Attempt 5 failed logins
    for i in 0..5 {
        let (status, _, _) = login_user(&app, &email, &format!("WrongPassword{}", i)).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "Failed login #{} should return 401",
            i + 1
        );
    }

    // 6th attempt should be rate limited (429 Too Many Requests)
    let (status, body, _) = login_user(&app, &email, "WrongPassword6").await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body.contains("too many") || body.contains("attempts") || body.contains("locked"));
}

#[tokio::test]
async fn test_csrf_token_endpoint() {
    let app = common::create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/csrf-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify CSRF cookie is set
    let cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let csrf_cookie = cookies.iter().find(|c| c.starts_with("csrf_token="));
    assert!(csrf_cookie.is_some(), "CSRF token cookie should be set");

    // Verify JSON response contains token
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value =
        serde_json::from_str(std::str::from_utf8(&body).unwrap()).unwrap();
    assert!(json["csrf_token"].is_string());
}

// Note: RBAC tests require seeded users with specific roles
// These tests are marked with #[ignore] and can be run when test database is seeded

#[tokio::test]
#[ignore]
async fn test_student_cannot_access_admin_routes() {
    let app = common::create_test_app().await;

    // Register student
    let email = format!("student-{}@example.com", chrono::Utc::now().timestamp());
    let (_, body, _) = register_user(&app, &email, "Password123!", "Student").await;
    let access_token = extract_access_token(&body).unwrap();

    // Try to access admin route (list users)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/users")
                .header(header::AUTHORIZATION, format!("Bearer {}", access_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should return 403 Forbidden
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
#[ignore]
async fn test_admin_can_access_admin_routes() {
    // This test requires a pre-seeded admin user in the test database
    // Or a way to create admin users (e.g., test-only endpoint)
    let app = common::create_test_app().await;

    // Login as admin (pre-seeded user)
    let admin_email = "admin@test.com";
    let admin_password = "AdminPassword123!";

    let (status, body, _) = login_user(&app, admin_email, admin_password).await;
    assert_eq!(status, StatusCode::OK);

    let access_token = extract_access_token(&body).unwrap();

    // Access admin route
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/users")
                .header(header::AUTHORIZATION, format!("Bearer {}", access_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
