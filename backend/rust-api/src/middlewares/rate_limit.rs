use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use redis::aio::ConnectionManager;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::services::AppState;

const RATE_LIMIT_PER_USER: u32 = 100; // requests per minute
const RATE_LIMIT_PER_IP: u32 = 200; // requests per minute
const RATE_WINDOW_SECONDS: u64 = 60; // 1 minute

fn extract_client_ip_from(headers: &HeaderMap, extensions: &axum::http::Extensions) -> String {
    // Preferred order: X-Forwarded-For, Forwarded, X-Real-IP, ConnectInfo
    if let Some(v) = headers.get("x-forwarded-for") {
        if let Ok(s) = v.to_str() {
            // x-forwarded-for can be a comma separated list; take first
            return s.split(',').next().unwrap_or(s).trim().to_string();
        }
    }

    if let Some(v) = headers.get("forwarded") {
        if let Ok(s) = v.to_str() {
            // forwarded: for=1.2.3.4; proto=http; by=...
            for part in s.split(';') {
                let p = part.trim();
                if p.starts_with("for=") {
                    let val = p.trim_start_matches("for=").trim().trim_matches('\"');
                    return val.to_string();
                }
            }
        }
    }

    if let Some(v) = headers.get("x-real-ip") {
        if let Ok(s) = v.to_str() {
            return s.trim().to_string();
        }
    }

    // Fall back to ConnectInfo socket address if available
    if let Some(ci) = extensions.get::<ConnectInfo<SocketAddr>>() {
        return ci.0.ip().to_string();
    }

    "unknown".to_string()
}

pub async fn rate_limit_middleware(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers = request.headers();
    let extensions = request.extensions();

    let client_ip = extract_client_ip_from(headers, extensions);

    // Extract user_id from JWT claims if available
    let user_id = request
        .extensions()
        .get::<super::auth::JwtClaims>()
        .map(|claims| claims.sub.clone());

    // Check rate limits
    if let Some(uid) = &user_id {
        let allowed = check_rate_limit(
            &state.redis,
            &format!("ratelimit:user:{}", uid),
            RATE_LIMIT_PER_USER,
        )
        .await
        .map_err(|e| {
            tracing::error!("Rate limit check failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if !allowed {
            tracing::warn!("Rate limit exceeded for user: {}", uid);
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
    }

    // Check IP rate limit
    // Allow disabling rate limits in local perf runs by setting RATE_LIMIT_DISABLED=1
    let rate_limit_disabled = std::env::var("RATE_LIMIT_DISABLED").unwrap_or_default() == "1";

    if !rate_limit_disabled {
        // allow overriding per-IP limit via env RATE_LIMIT_PER_IP
        let ip_limit = std::env::var("RATE_LIMIT_PER_IP")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(RATE_LIMIT_PER_IP);

        let allowed = check_rate_limit(
            &state.redis,
            &format!("ratelimit:ip:{}", client_ip),
            ip_limit,
        )
        .await
        .map_err(|e| {
            tracing::error!("Rate limit check failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if !allowed {
            tracing::warn!("Rate limit exceeded for IP: {}", client_ip);
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
    } else {
        tracing::debug!("Rate limiting disabled via RATE_LIMIT_DISABLED=1");
    }

    Ok(next.run(request).await)
}

/// Check rate limit using Redis with Lua script for atomicity
async fn check_rate_limit(
    redis: &ConnectionManager,
    key: &str,
    limit: u32,
) -> anyhow::Result<bool> {
    let mut conn = redis.clone();

    // Lua script for atomic increment with sliding window
    let lua_script = r#"
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        
        local current = redis.call('GET', key)
        
        if current == false then
            redis.call('SET', key, 1, 'EX', window)
            return 1
        end
        
        current = tonumber(current)
        
        if current >= limit then
            return 0
        end
        
        redis.call('INCR', key)
        return 1
    "#;

    let allowed: u32 = redis::Script::new(lua_script)
        .key(key)
        .arg(limit)
        .arg(RATE_WINDOW_SECONDS)
        .invoke_async(&mut conn)
        .await?;

    Ok(allowed == 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::ConnectInfo;
    use axum::http::HeaderMap;
    use std::net::SocketAddr;

    #[test]
    fn test_extract_client_ip_x_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "1.2.3.4".parse().unwrap());
        let exts = axum::http::Extensions::new();
        assert_eq!(
            extract_client_ip_from(&headers, &exts),
            "1.2.3.4".to_string()
        );
    }

    #[test]
    fn test_extract_client_ip_forwarded() {
        let mut headers = HeaderMap::new();
        headers.insert("forwarded", "for=5.6.7.8;proto=http".parse().unwrap());
        let exts = axum::http::Extensions::new();
        assert_eq!(
            extract_client_ip_from(&headers, &exts),
            "5.6.7.8".to_string()
        );
    }

    #[test]
    fn test_extract_client_ip_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "9.9.9.9".parse().unwrap());
        let exts = axum::http::Extensions::new();
        assert_eq!(
            extract_client_ip_from(&headers, &exts),
            "9.9.9.9".to_string()
        );
    }

    #[test]
    fn test_extract_client_ip_connectinfo() {
        let headers = HeaderMap::new();
        let mut exts = axum::http::Extensions::new();
        exts.insert(ConnectInfo::<SocketAddr>("7.7.7.7:1234".parse().unwrap()));
        assert_eq!(
            extract_client_ip_from(&headers, &exts),
            "7.7.7.7".to_string()
        );
    }
}
