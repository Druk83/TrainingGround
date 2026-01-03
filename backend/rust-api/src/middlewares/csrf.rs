use axum::{
    extract::Request,
    http::{header, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use lazy_static::lazy_static;
use rand::Rng;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use url::Url;

const CSRF_COOKIE_NAME: &str = "csrf_token";
const CSRF_HEADER_NAME: &str = "x-csrf-token";
const NONCE_HEADER_NAME: &str = "x-request-nonce";
const TIMESTAMP_HEADER_NAME: &str = "x-request-timestamp";
const NONCE_TTL_SECONDS: u64 = 300;
const MAX_CLOCK_SKEW_SECONDS: i64 = 60;

lazy_static! {
    static ref ALLOWED_ORIGINS: Vec<String> = {
        let raw = std::env::var("CSRF_ALLOWED_ORIGINS").unwrap_or_else(|_| {
            "http://localhost:8081,http://localhost:4173,http://localhost:5173".to_string()
        });
        raw.split(',')
            .filter_map(|origin| normalize_origin(origin.trim()))
            .collect()
    };
    static ref USED_NONCES: Mutex<HashMap<String, Instant>> = Mutex::new(HashMap::new());
}

/// CSRF middleware using double-submit cookie pattern
///
/// For state-changing requests (POST, PUT, DELETE, PATCH):
/// 1. Checks for CSRF token in cookie
/// 2. Checks for matching token in X-CSRF-Token header
/// 3. Validates they match
///
/// For GET/HEAD/OPTIONS requests: passes through
///
/// Token generation endpoint should be added separately
pub async fn csrf_middleware(request: Request, next: Next) -> Result<Response, StatusCode> {
    let method = request.method().clone();

    // Skip CSRF check for safe methods
    if matches!(method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(next.run(request).await);
    }

    if let Some(origin) = extract_origin(request.headers()) {
        if !ALLOWED_ORIGINS.contains(&origin) {
            tracing::warn!("CSRF validation failed: disallowed origin {origin}");
            return Err(StatusCode::FORBIDDEN);
        }
    }

    let nonce = request
        .headers()
        .get(NONCE_HEADER_NAME)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| {
            tracing::warn!("CSRF validation failed: missing nonce header");
            StatusCode::FORBIDDEN
        })?;

    let timestamp = request
        .headers()
        .get(TIMESTAMP_HEADER_NAME)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or_else(|| {
            tracing::warn!("CSRF validation failed: invalid timestamp header");
            StatusCode::FORBIDDEN
        })?;

    ensure_unique_nonce(&nonce, timestamp).await?;

    // Extract CSRF token from cookie
    let cookie_token = request
        .headers()
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let parts: Vec<&str> = cookie.trim().splitn(2, '=').collect();
                if parts.len() == 2 && parts[0] == CSRF_COOKIE_NAME {
                    Some(parts[1].to_string())
                } else {
                    None
                }
            })
        });

    // Extract CSRF token from header
    let header_token = request
        .headers()
        .get(CSRF_HEADER_NAME)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Validate tokens match
    match (cookie_token, header_token) {
        (Some(cookie), Some(header)) if cookie == header => {
            tracing::debug!("CSRF validation passed");
            Ok(next.run(request).await)
        }
        (None, _) => {
            tracing::warn!("CSRF validation failed: missing cookie token");
            Err(StatusCode::FORBIDDEN)
        }
        (_, None) => {
            tracing::warn!("CSRF validation failed: missing header token");
            Err(StatusCode::FORBIDDEN)
        }
        _ => {
            tracing::warn!("CSRF validation failed: token mismatch");
            Err(StatusCode::FORBIDDEN)
        }
    }
}

fn extract_origin(headers: &axum::http::HeaderMap) -> Option<String> {
    if let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .and_then(normalize_origin)
    {
        return Some(origin);
    }

    headers
        .get(header::REFERER)
        .and_then(|v| v.to_str().ok())
        .and_then(normalize_origin)
}

fn normalize_origin(value: &str) -> Option<String> {
    Url::parse(value).ok().and_then(|parsed| {
        parsed.host_str().map(|host| {
            let mut origin = format!("{}://{}", parsed.scheme(), host);
            let port = match (parsed.scheme(), parsed.port()) {
                ("https", Some(port)) => Some(port),
                ("https", None) => Some(443),
                ("http", Some(port)) => Some(port),
                ("http", None) => None,
                (_, port) => port,
            };

            if let Some(port) = port {
                origin.push_str(&format!(":{port}"));
            }
            origin.to_lowercase()
        })
    })
}

async fn ensure_unique_nonce(nonce: &str, timestamp: i64) -> Result<(), StatusCode> {
    let now = Utc::now().timestamp();
    let max_age = NONCE_TTL_SECONDS as i64 + MAX_CLOCK_SKEW_SECONDS;

    if (now - timestamp).abs() > max_age {
        tracing::warn!("CSRF validation failed: stale timestamp detected");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let mut cache = USED_NONCES.lock().await;
    let now_instant = Instant::now();
    let ttl = Duration::from_secs(NONCE_TTL_SECONDS);

    cache.retain(|_, inserted| now_instant.duration_since(*inserted) <= ttl);

    if cache.contains_key(nonce) {
        tracing::warn!("CSRF validation failed: nonce replay detected");
        return Err(StatusCode::CONFLICT);
    }

    cache.insert(nonce.to_string(), now_instant);
    Ok(())
}

/// Generate a new CSRF token
pub fn generate_csrf_token() -> String {
    let random_bytes: [u8; 32] = rand::rng().random();
    general_purpose::URL_SAFE_NO_PAD.encode(random_bytes)
}

/// Create a response with CSRF cookie set
pub fn set_csrf_cookie(mut response: Response, token: &str) -> Response {
    let cookie_value = format!(
        "{}={}; Path=/; HttpOnly; SameSite=Strict; Secure",
        CSRF_COOKIE_NAME, token
    );

    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie_value.parse().unwrap());

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_csrf_token() {
        let token1 = generate_csrf_token();
        let token2 = generate_csrf_token();

        // Tokens should be non-empty
        assert!(!token1.is_empty());
        assert!(!token2.is_empty());

        // Tokens should be unique
        assert_ne!(token1, token2);

        // Tokens should be valid base64
        assert!(general_purpose::URL_SAFE_NO_PAD.decode(&token1).is_ok());
    }

    #[test]
    fn test_normalize_origin() {
        assert_eq!(
            normalize_origin("https://example.com:443"),
            Some("https://example.com:443".to_string())
        );
        assert_eq!(
            normalize_origin("http://example.com"),
            Some("http://example.com".to_string())
        );
        assert!(normalize_origin("not-a-url").is_none());
    }

    #[tokio::test]
    async fn test_nonce_replay_detection() {
        // ensure clean state for test
        USED_NONCES.lock().await.clear();

        let nonce = "nonce123";
        let ts = Utc::now().timestamp();

        assert!(ensure_unique_nonce(nonce, ts).await.is_ok());
        assert!(ensure_unique_nonce(nonce, ts).await.is_err());
    }
}
