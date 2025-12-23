use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;

use crate::metrics::{HTTP_REQUESTS_TOTAL, HTTP_REQUEST_DURATION_SECONDS};

/// Middleware для сбора HTTP метрик (latency, request count)
pub async fn metrics_middleware(req: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().to_string();
    let path = normalize_path(req.uri().path());

    // Execute the request
    let response = next.run(req).await;

    // Record metrics
    let duration = start.elapsed().as_secs_f64();
    let status = response.status().as_u16().to_string();

    // Record request count
    HTTP_REQUESTS_TOTAL
        .with_label_values(&[&method, &path, &status])
        .inc();

    // Record request duration
    HTTP_REQUEST_DURATION_SECONDS
        .with_label_values(&[&method, &path])
        .observe(duration);

    response
}

/// Normalize URL path to avoid cardinality explosion
/// Replaces dynamic segments like UUIDs with placeholders
fn normalize_path(path: &str) -> String {
    let segments: Vec<&str> = path.split('/').collect();
    let mut normalized = Vec::new();

    for segment in segments {
        // Check if segment looks like a UUID or ID
        if is_uuid_like(segment) || is_numeric_id(segment) {
            normalized.push("{id}");
        } else {
            normalized.push(segment);
        }
    }

    normalized.join("/")
}

/// Check if string looks like a UUID
fn is_uuid_like(s: &str) -> bool {
    // UUID format: 8-4-4-4-12 hex characters
    if s.len() != 36 {
        return false;
    }
    s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Check if string is a numeric ID
fn is_numeric_id(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path() {
        assert_eq!(
            normalize_path("/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000"),
            "/api/v1/sessions/{id}"
        );
        assert_eq!(
            normalize_path("/api/v1/sessions/123/answers"),
            "/api/v1/sessions/{id}/answers"
        );
        assert_eq!(normalize_path("/health"), "/health");
        assert_eq!(normalize_path("/metrics"), "/metrics");
    }

    #[test]
    fn test_is_uuid_like() {
        assert!(is_uuid_like("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_uuid_like("not-a-uuid"));
        assert!(!is_uuid_like("12345"));
    }

    #[test]
    fn test_is_numeric_id() {
        assert!(is_numeric_id("123"));
        assert!(is_numeric_id("999999"));
        assert!(!is_numeric_id("abc"));
        assert!(!is_numeric_id(""));
    }
}
