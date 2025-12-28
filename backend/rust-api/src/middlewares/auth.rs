use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::services::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JwtClaims {
    pub sub: String,            // user_id
    pub role: String,           // user role (student, teacher, admin)
    pub group_ids: Vec<String>, // groups user belongs to
    pub exp: usize,             // expiration timestamp
    pub iat: usize,             // issued at timestamp
}

#[derive(Debug)]
pub enum AuthError {
    InvalidToken,
    ExpiredToken,
    MissingToken,
    InvalidSignature,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::InvalidToken => write!(f, "Invalid token"),
            AuthError::ExpiredToken => write!(f, "Token expired"),
            AuthError::MissingToken => write!(f, "Missing authorization token"),
            AuthError::InvalidSignature => write!(f, "Invalid token signature"),
        }
    }
}

impl std::error::Error for AuthError {}

pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

impl JwtService {
    pub fn new(secret: &str) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn generate_token(&self, claims: JwtClaims) -> Result<String, AuthError> {
        encode(&Header::default(), &claims, &self.encoding_key).map_err(|_| AuthError::InvalidToken)
    }

    pub fn validate_token(&self, token: &str) -> Result<JwtClaims, AuthError> {
        let validation = Validation::default();

        decode::<JwtClaims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|e| {
                if e.to_string().contains("ExpiredSignature") {
                    AuthError::ExpiredToken
                } else if e.to_string().contains("InvalidSignature") {
                    AuthError::InvalidSignature
                } else {
                    AuthError::InvalidToken
                }
            })
    }
}

/// Middleware для проверки JWT токена
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract token from Authorization header
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Validate token
    let jwt_service = JwtService::new(&state.config.jwt_secret);
    let claims = jwt_service.validate_token(token).map_err(|e| {
        tracing::warn!("JWT validation failed: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    tracing::debug!("Authenticated user: {} (role: {})", claims.sub, claims.role);

    // Store claims in request extensions for handlers to use
    request.extensions_mut().insert(claims);

    Ok(next.run(request).await)
}

/// Optional auth - allows requests without token, but validates if present
pub async fn optional_auth_middleware(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut request: Request,
    next: Next,
) -> Response {
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                let jwt_service = JwtService::new(&state.config.jwt_secret);
                if let Ok(claims) = jwt_service.validate_token(token) {
                    request.extensions_mut().insert(claims);
                }
            }
        }
    }

    next.run(request).await
}

pub async fn admin_guard_middleware(request: Request, next: Next) -> Result<Response, StatusCode> {
    let claims = request.extensions().get::<JwtClaims>();
    if let Some(claims) = claims {
        if claims.role == "admin" {
            return Ok(next.run(request).await);
        }
    }
    tracing::warn!("Access denied: admin role required");
    Err(StatusCode::FORBIDDEN)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_generation_and_validation() {
        let service = JwtService::new("test-secret");

        let claims = JwtClaims {
            sub: "user123".to_string(),
            role: "student".to_string(),
            group_ids: vec!["group1".to_string()],
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iat: chrono::Utc::now().timestamp() as usize,
        };

        let token = service.generate_token(claims.clone()).unwrap();
        let validated = service.validate_token(&token).unwrap();

        assert_eq!(validated.sub, claims.sub);
        assert_eq!(validated.role, claims.role);
    }
}
