use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use base64::{engine::general_purpose, Engine as _};
use rand::Rng;

const CSRF_COOKIE_NAME: &str = "csrf_token";
const CSRF_HEADER_NAME: &str = "x-csrf-token";

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
    let method = request.method();

    // Skip CSRF check for safe methods
    if method == "GET" || method == "HEAD" || method == "OPTIONS" {
        return Ok(next.run(request).await);
    }

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
            // Tokens match, proceed with request
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
}
