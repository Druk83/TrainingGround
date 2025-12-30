// Rate limiting verification tests
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

/// Helper to flush Redis rate limit keys before test
async fn flush_rate_limit_keys() {
    // Connect to test Redis and flush rate limit keys
    let redis_uri = std::env::var("REDIS_URI")
        .unwrap_or_else(|_| "redis://:changeMeRedis@127.0.0.1:6379/0".to_string());
    let client = redis::Client::open(redis_uri).expect("Failed to connect to Redis for cleanup");
    let mut conn = client
        .get_connection_manager()
        .await
        .expect("Failed to get Redis connection");

    // Delete all ratelimit:* keys
    let keys: Vec<String> = redis::cmd("KEYS")
        .arg("ratelimit:*")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    if !keys.is_empty() {
        let _: () = redis::cmd("DEL")
            .arg(&keys)
            .query_async(&mut conn)
            .await
            .expect("Failed to delete rate limit keys");
        eprintln!("Flushed {} rate limit keys from Redis", keys.len());
    }

    // Also flush failed_login_attempts:* keys
    let failed_keys: Vec<String> = redis::cmd("KEYS")
        .arg("failed_login_attempts:*")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    if !failed_keys.is_empty() {
        let _: () = redis::cmd("DEL")
            .arg(&failed_keys)
            .query_async(&mut conn)
            .await
            .expect("Failed to delete failed login keys");
        eprintln!("Flushed {} failed login keys from Redis", failed_keys.len());
    }
}

/// Helper to make a login request with custom IP header
async fn login_with_ip(app: &axum::Router, email: &str, password: &str, ip: &str) -> StatusCode {
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
                .header("x-forwarded-for", ip)
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    response.status()
}

/// Helper to make a register request with custom IP header
async fn register_with_ip(
    app: &axum::Router,
    email: &str,
    password: &str,
    name: &str,
    ip: &str,
) -> StatusCode {
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
                .header("x-forwarded-for", ip)
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    response.status()
}

/// Test login rate limiting (10 attempts per 5 min per IP)
/// Проверка RATE_LIMIT_LOGIN_ATTEMPTS=10
/// NOTE: Tests IP-based rate limiting, not failed auth monitoring
#[tokio::test]
#[serial_test::serial]
async fn test_login_rate_limiting_per_ip() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    // Set environment variable for test
    std::env::set_var("RATE_LIMIT_LOGIN_ATTEMPTS", "10");
    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let test_ip = "192.168.1.100";
    let timestamp = chrono::Utc::now().timestamp();

    // Register 11 different users from DIFFERENT IPs to avoid register rate limiting
    // We want to test IP-based login rate limiting, not user-based blocking or register limits
    for i in 0..11 {
        let email = format!("rate-test-login-{}-{}@example.com", timestamp, i);
        let register_ip = format!("192.168.1.{}", 150 + i); // Different IP for each registration
        let status =
            register_with_ip(&app, &email, "ValidPassword123!", "Test User", &register_ip).await;
        assert_eq!(status, StatusCode::CREATED);
    }

    // Attempt 10 logins from same IP with DIFFERENT users (wrong password)
    // This tests IP-based rate limiting
    for i in 0..10 {
        let email = format!("rate-test-login-{}-{}@example.com", timestamp, i);
        let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
        // Should get 401 Unauthorized (wrong password), not 429 (rate limit)
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "Login attempt {} should be allowed (within rate limit of 10), got status: {}",
            i + 1,
            status
        );
    }

    // 11th attempt should be rate limited (429 Too Many Requests)
    let email = format!("rate-test-login-{}-10@example.com", timestamp);
    let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "11th login attempt should be rate limited"
    );

    // Request from different IP should still work
    let different_ip = "192.168.1.101";
    let email = format!("rate-test-login-{}-0@example.com", timestamp);
    let status = login_with_ip(&app, &email, "WrongPassword", different_ip).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "Login from different IP should not be rate limited"
    );
}

/// Test register rate limiting (5 attempts per hour per IP)
/// Проверка RATE_LIMIT_REGISTER_ATTEMPTS=5
#[tokio::test]
#[serial_test::serial]
async fn test_register_rate_limiting_per_ip() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    // Set environment variable for test
    std::env::set_var("RATE_LIMIT_REGISTER_ATTEMPTS", "5");
    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let test_ip = "192.168.2.100";
    let timestamp = chrono::Utc::now().timestamp();

    // Attempt 5 registrations (all should succeed)
    for i in 0..5 {
        let email = format!("rate-test-register-{}-{}@example.com", timestamp, i);
        let status =
            register_with_ip(&app, &email, "ValidPassword123!", "Test User", test_ip).await;
        assert_eq!(
            status,
            StatusCode::CREATED,
            "Registration attempt {} should succeed (within rate limit of 5)",
            i + 1
        );
    }

    // 6th registration should be rate limited (429 Too Many Requests)
    let email = format!("rate-test-register-{}-extra@example.com", timestamp);
    let status = register_with_ip(&app, &email, "ValidPassword123!", "Test User", test_ip).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "6th registration attempt should be rate limited"
    );

    // Request from different IP should still work
    let different_ip = "192.168.2.101";
    let email = format!("rate-test-register-{}-different-ip@example.com", timestamp);
    let status =
        register_with_ip(&app, &email, "ValidPassword123!", "Test User", different_ip).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "Registration from different IP should not be rate limited"
    );
}

/// Test failed auth monitoring (5 failed attempts → block)
/// Проверка что после 5 неудачных попыток пользователь блокируется
#[tokio::test]
#[serial_test::serial]
async fn test_failed_auth_monitoring_blocks_user() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let timestamp = chrono::Utc::now().timestamp();
    let email = format!("failed-auth-test-{}@example.com", timestamp);
    let test_ip = "192.168.3.100";

    // Register user
    let status = register_with_ip(
        &app,
        &email,
        "CorrectPassword123!",
        "Failed Auth Test",
        test_ip,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    // Attempt 5 failed logins with wrong password
    for i in 0..5 {
        let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "Failed login attempt {} should return 401 (wrong password)",
            i + 1
        );
    }

    // 6th attempt should be blocked (429 Too Many Requests or specific "account locked" error)
    // This is enforced by the failed_auth_monitoring in auth_service.rs
    let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
    assert!(
        status == StatusCode::TOO_MANY_REQUESTS || status == StatusCode::FORBIDDEN,
        "After 5 failed attempts, user should be blocked. Got status: {}",
        status
    );

    // Even with correct password, should still be blocked during lockout period
    let status = login_with_ip(&app, &email, "CorrectPassword123!", test_ip).await;
    assert!(
        status == StatusCode::TOO_MANY_REQUESTS || status == StatusCode::FORBIDDEN,
        "User should remain blocked even with correct password during lockout. Got status: {}",
        status
    );
}

/// Test rate limiter with concurrent requests
/// Нагрузочное тестирование Redis rate limiter
#[tokio::test]
#[serial_test::serial]
async fn test_concurrent_login_requests_rate_limiting() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    std::env::set_var("RATE_LIMIT_LOGIN_ATTEMPTS", "10");
    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let timestamp = chrono::Utc::now().timestamp();
    let email = format!("concurrent-test-{}@example.com", timestamp);
    let test_ip = "192.168.4.100";

    // Register user
    let status = register_with_ip(
        &app,
        &email,
        "ValidPassword123!",
        "Concurrent Test",
        test_ip,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    // Spawn 20 concurrent login requests from the same IP
    let mut handles = vec![];
    for _i in 0..20 {
        let app_clone = app.clone();
        let email_clone = email.clone();
        let ip_clone = test_ip.to_string();

        let handle = tokio::spawn(async move {
            login_with_ip(&app_clone, &email_clone, "WrongPassword", &ip_clone).await
        });
        handles.push(handle);
    }

    // Collect results
    let mut results = vec![];
    for handle in handles {
        let status = handle.await.unwrap();
        results.push(status);
    }

    // Count how many requests succeeded (401 Unauthorized - within rate limit)
    // and how many were rate limited (429 Too Many Requests)
    let unauthorized_count = results
        .iter()
        .filter(|&&s| s == StatusCode::UNAUTHORIZED)
        .count();
    let rate_limited_count = results
        .iter()
        .filter(|&&s| s == StatusCode::TOO_MANY_REQUESTS)
        .count();

    eprintln!(
        "Concurrent test results: {} unauthorized, {} rate limited",
        unauthorized_count, rate_limited_count
    );

    // With limit of 10, we expect approximately:
    // - 10 requests to succeed (get 401 Unauthorized)
    // - 10 requests to be rate limited (get 429)
    // Due to race conditions, allow some margin of error (8-12 for each)
    assert!(
        (8..=12).contains(&unauthorized_count),
        "Expected ~10 requests within rate limit, got {}",
        unauthorized_count
    );
    assert!(
        (8..=12).contains(&rate_limited_count),
        "Expected ~10 requests rate limited, got {}",
        rate_limited_count
    );
    assert_eq!(
        unauthorized_count + rate_limited_count,
        20,
        "All 20 requests should be accounted for"
    );
}

/// Test rate limiter with concurrent register requests
#[tokio::test]
#[serial_test::serial]
async fn test_concurrent_register_requests_rate_limiting() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    std::env::set_var("RATE_LIMIT_REGISTER_ATTEMPTS", "5");
    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let timestamp = chrono::Utc::now().timestamp();
    let test_ip = "192.168.5.100";

    // Spawn 10 concurrent registration requests from the same IP
    let mut handles = vec![];
    for i in 0..10 {
        let app_clone = app.clone();
        let email = format!("concurrent-register-{}-{}@example.com", timestamp, i);
        let ip_clone = test_ip.to_string();

        let handle = tokio::spawn(async move {
            register_with_ip(
                &app_clone,
                &email,
                "ValidPassword123!",
                "Test User",
                &ip_clone,
            )
            .await
        });
        handles.push(handle);
    }

    // Collect results
    let mut results = vec![];
    for handle in handles {
        let status = handle.await.unwrap();
        results.push(status);
    }

    // Count successes and rate limits
    let created_count = results
        .iter()
        .filter(|&&s| s == StatusCode::CREATED)
        .count();
    let rate_limited_count = results
        .iter()
        .filter(|&&s| s == StatusCode::TOO_MANY_REQUESTS)
        .count();

    eprintln!(
        "Concurrent register test: {} created, {} rate limited",
        created_count, rate_limited_count
    );

    // With limit of 5, expect ~5 created and ~5 rate limited
    // Allow margin of error (3-7 for each)
    assert!(
        (3..=7).contains(&created_count),
        "Expected ~5 registrations to succeed, got {}",
        created_count
    );
    assert!(
        (3..=7).contains(&rate_limited_count),
        "Expected ~5 registrations rate limited, got {}",
        rate_limited_count
    );
    assert_eq!(
        created_count + rate_limited_count,
        10,
        "All 10 requests should be accounted for"
    );
}

/// Test that rate limits can be disabled via environment variable
#[tokio::test]
#[serial_test::serial]
async fn test_rate_limiting_can_be_disabled() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    // Disable rate limiting
    std::env::set_var("RATE_LIMIT_DISABLED", "1");

    let app = common::create_test_app().await;
    let timestamp = chrono::Utc::now().timestamp();
    let test_ip = "192.168.6.100";

    // Register 20 different users to avoid failed_auth_monitoring (5 failed attempts per user)
    // We want to test that IP-based rate limiting is disabled, not failed auth monitoring
    for i in 0..20 {
        let email = format!("no-limit-test-{}-{}@example.com", timestamp, i);
        let status = register_with_ip(
            &app,
            &email,
            "ValidPassword123!",
            "No Limit Test",
            &format!("192.168.6.{}", 100 + i),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
    }

    // Attempt 20 logins from same IP with DIFFERENT users (wrong password)
    // With rate limiting disabled, all should get 401 (wrong password), not 429
    for i in 0..20 {
        let email = format!("no-limit-test-{}-{}@example.com", timestamp, i);
        let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "Login attempt {} should not be rate limited when RATE_LIMIT_DISABLED=1",
            i + 1
        );
    }

    // Re-enable rate limiting for other tests
    std::env::set_var("RATE_LIMIT_DISABLED", "0");
}

/// Test rate limit window expiration
/// Проверка что после истечения окна (5 мин для login) счетчик сбрасывается
#[tokio::test]
#[serial_test::serial]
#[ignore] // Ignore by default because it requires waiting for window expiration (slow test)
async fn test_rate_limit_window_expiration() {
    // Clean up Redis before test
    flush_rate_limit_keys().await;

    std::env::set_var("RATE_LIMIT_LOGIN_ATTEMPTS", "3"); // Lower limit for faster test
    std::env::set_var("RATE_LIMIT_DISABLED", "0");

    let app = common::create_test_app().await;
    let timestamp = chrono::Utc::now().timestamp();
    let email = format!("window-expiration-test-{}@example.com", timestamp);
    let test_ip = "192.168.7.100";

    // Register user
    let status = register_with_ip(&app, &email, "ValidPassword123!", "Window Test", test_ip).await;
    assert_eq!(status, StatusCode::CREATED);

    // Exhaust rate limit (3 attempts)
    for i in 0..3 {
        let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "Attempt {} should be allowed",
            i + 1
        );
    }

    // 4th attempt should be rate limited
    let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
    assert_eq!(
        status,
        StatusCode::TOO_MANY_REQUESTS,
        "Should be rate limited"
    );

    // Wait for rate limit window to expire (5 minutes + buffer)
    // NOTE: In production, window is 300 seconds (5 min). For testing, you might want to
    // configure a shorter window via environment variable
    eprintln!("Waiting for rate limit window to expire (this test is slow)...");
    tokio::time::sleep(tokio::time::Duration::from_secs(310)).await;

    // After window expires, should be able to login again
    let status = login_with_ip(&app, &email, "WrongPassword", test_ip).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "After window expiration, rate limit should reset (expected 401, got {})",
        status
    );
}
