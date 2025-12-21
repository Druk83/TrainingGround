use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use redis::aio::ConnectionManager;
use std::sync::Arc;

use crate::services::AppState;

const RATE_LIMIT_PER_USER: u32 = 100; // requests per minute
const RATE_LIMIT_PER_IP: u32 = 200; // requests per minute
const RATE_WINDOW_SECONDS: u64 = 60; // 1 minute

pub async fn rate_limit_middleware(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let client_ip = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            request
                .headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
        })
        .unwrap_or("unknown");

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
    let allowed = check_rate_limit(
        &state.redis,
        &format!("ratelimit:ip:{}", client_ip),
        RATE_LIMIT_PER_IP,
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
