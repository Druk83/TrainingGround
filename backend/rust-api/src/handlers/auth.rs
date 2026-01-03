use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Extension, Json,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use std::sync::Arc;
use validator::Validate;

use crate::{
    extractors::AppJson,
    middlewares::auth::{JwtClaims, JwtService},
    models::{
        refresh_token::RefreshTokenResponse,
        user::{
            AuthResponseCookie, ChangePasswordRequest, ListUsersQuery, LoginRequest,
            RegisterRequest, UpdateUserRequest, User, UserProfile,
        },
    },
    services::{audit_service::AuditService, auth_service::AuthService, AppState},
};

/// POST /api/v1/auth/register - Register a new user
pub async fn register(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    AppJson(req): AppJson<RegisterRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate request
    if let Err(e) = req.validate() {
        return Err((StatusCode::BAD_REQUEST, format!("Validation error: {}", e)));
    }

    tracing::info!("Registering new user: {}", req.email);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);
    let audit_service = AuditService::new(state.mongo.clone());

    // Save email for audit logging
    let email = req.email.clone();

    match service.register(req).await {
        Ok(response) => {
            tracing::info!("User registered successfully");

            // Log successful registration
            let _ = audit_service
                .log_register_success(&response.user.id, &response.user.email, None, None)
                .await;

            // Set refresh_token as HTTP-only cookie
            let cookie = Cookie::build(("refresh_token", response.refresh_token.clone()))
                .path("/api/v1/auth")
                .http_only(true)
                .secure(state.config.cookie.secure)
                .same_site(state.config.cookie.parse_same_site())
                .max_age(time::Duration::days(30))
                .build();

            let jar = jar.add(cookie);

            // Return only access_token and user in JSON
            let response_body = AuthResponseCookie {
                access_token: response.access_token,
                user: response.user,
            };

            Ok((StatusCode::CREATED, jar, Json(response_body)))
        }
        Err(e) => {
            tracing::error!("Failed to register user: {}", e);

            // Log failed registration
            let _ = audit_service
                .log_register_failed(&email, None, None, &e.to_string())
                .await;

            Err((StatusCode::BAD_REQUEST, e.to_string()))
        }
    }
}

/// POST /api/v1/auth/login - Login with email and password
pub async fn login(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    request: Request,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Extract IP and User-Agent from headers
    let headers = request.headers();
    let ip = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Extract JSON body
    let body_bytes = axum::body::to_bytes(request.into_body(), usize::MAX)
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("Failed to read body: {}", e),
            )
        })?;

    let req: LoginRequest = serde_json::from_slice(&body_bytes)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid JSON: {}", e)))?;

    // Validate request
    if let Err(e) = req.validate() {
        return Err((StatusCode::BAD_REQUEST, format!("Validation error: {}", e)));
    }

    tracing::info!("Login attempt for user: {}", req.email);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);
    let audit_service = AuditService::new(state.mongo.clone());

    // Save email for audit logging
    let email = req.email.clone();

    // Check if account is locked due to failed login attempts
    let is_locked = service.check_failed_attempts(&email).await.unwrap_or(false); // Default to unlocked if Redis check fails

    if is_locked {
        tracing::warn!("Login blocked for {}: too many failed attempts", email);
        let _ = audit_service
            .log_login_failed(
                &email,
                ip,
                user_agent,
                "Account temporarily locked due to too many failed attempts",
            )
            .await;
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Too many failed login attempts. Please try again later.".to_string(),
        ));
    }

    match service.login(req, ip.clone(), user_agent.clone()).await {
        Ok(response) => {
            tracing::info!("User logged in successfully");

            // Clear failed login attempts on successful login
            let _ = service.clear_failed_attempts(&email).await;

            // Log successful login
            let _ = audit_service
                .log_login_success(
                    &response.user.id,
                    &response.user.email,
                    ip.clone(),
                    user_agent.clone(),
                )
                .await;

            // Set refresh_token as HTTP-only cookie
            let cookie = Cookie::build(("refresh_token", response.refresh_token.clone()))
                .path("/api/v1/auth")
                .http_only(true)
                .secure(state.config.cookie.secure)
                .same_site(state.config.cookie.parse_same_site())
                .max_age(time::Duration::days(30))
                .build();

            let jar = jar.add(cookie);

            // Return only access_token and user in JSON
            let response_body = AuthResponseCookie {
                access_token: response.access_token,
                user: response.user,
            };

            Ok((StatusCode::OK, jar, Json(response_body)))
        }
        Err(e) => {
            tracing::warn!("Failed login: {}", e);

            // Increment failed login attempts counter
            let count = service.increment_failed_attempts(&email).await.unwrap_or(0);
            tracing::warn!("Failed login attempts for {}: {}/5", email, count);

            // Log failed login
            let _ = audit_service
                .log_login_failed(&email, ip, user_agent, &e.to_string())
                .await;

            Err((StatusCode::UNAUTHORIZED, e.to_string()))
        }
    }
}

/// POST /api/v1/auth/refresh - Refresh access token
pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("Refreshing access token");

    // Read refresh_token from HTTP-only cookie
    let refresh_token = jar
        .get("refresh_token")
        .map(|cookie| cookie.value().to_string())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing refresh token cookie".to_string(),
            )
        })?;

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    match service.refresh_token(&refresh_token).await {
        Ok(access_token) => {
            tracing::debug!("Access token refreshed successfully");
            Ok((StatusCode::OK, Json(RefreshTokenResponse { access_token })))
        }
        Err(e) => {
            tracing::warn!("Failed to refresh token: {}", e);
            Err((StatusCode::UNAUTHORIZED, e.to_string()))
        }
    }
}

/// POST /api/v1/auth/logout - Logout (revoke refresh token)
pub async fn logout(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Logging out user");

    // Read refresh_token from HTTP-only cookie
    let refresh_token = jar
        .get("refresh_token")
        .map(|cookie| cookie.value().to_string())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing refresh token cookie".to_string(),
            )
        })?;

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);
    let audit_service = AuditService::new(state.mongo.clone());

    match service.logout(&refresh_token).await {
        Ok(user_id) => {
            tracing::info!("User logged out successfully");

            // Log logout
            let _ = audit_service.log_logout(&user_id, None, None).await;

            // Clear the refresh_token cookie
            let cookie = Cookie::build(("refresh_token", ""))
                .path("/api/v1/auth")
                .http_only(true)
                .secure(state.config.cookie.secure)
                .same_site(state.config.cookie.parse_same_site())
                .max_age(time::Duration::ZERO)
                .build();

            let jar = jar.add(cookie);

            Ok((StatusCode::NO_CONTENT, jar))
        }
        Err(e) => {
            tracing::error!("Failed to logout: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

/// GET /api/v1/auth/me - Get current user profile (protected)
pub async fn get_current_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("Getting current user profile for user_id: {}", claims.sub);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    match service.get_user_by_id(&claims.sub).await {
        Ok(user) => {
            let profile = UserProfile::from(user);
            Ok((StatusCode::OK, Json(profile)))
        }
        Err(e) => {
            tracing::error!("Failed to get user: {}", e);
            Err((StatusCode::NOT_FOUND, e.to_string()))
        }
    }
}

/// GET /api/v1/auth/sessions - Get active sessions (protected)
pub async fn get_active_sessions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("Getting active sessions for user_id: {}", claims.sub);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    match service.get_active_sessions(&claims.sub, None).await {
        Ok(sessions) => Ok((StatusCode::OK, Json(sessions))),
        Err(e) => {
            tracing::error!("Failed to get sessions: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

/// POST /api/v1/auth/sessions/revoke - Revoke all sessions except current (protected)
pub async fn revoke_other_sessions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    jar: CookieJar,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::info!("Revoking other sessions for user_id: {}", claims.sub);

    // Read refresh_token from HTTP-only cookie
    let refresh_token = jar
        .get("refresh_token")
        .map(|cookie| cookie.value().to_string())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing refresh token cookie".to_string(),
            )
        })?;

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    match service
        .revoke_other_sessions(&claims.sub, &refresh_token)
        .await
    {
        Ok(count) => {
            tracing::info!("Revoked {} sessions", count);
            Ok((
                StatusCode::OK,
                Json(serde_json::json!({ "revoked_count": count })),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to revoke sessions: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

/// POST /api/v1/auth/change-password - Change password (protected)
pub async fn change_password(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(req): AppJson<ChangePasswordRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate request
    if let Err(e) = req.validate() {
        return Err((StatusCode::BAD_REQUEST, format!("Validation error: {}", e)));
    }

    tracing::info!("Changing password for user_id: {}", claims.sub);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);
    let audit_service = AuditService::new(state.mongo.clone());

    // Get current user
    let user = service
        .get_user_by_id(&claims.sub)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    // Verify old password
    if !service
        .verify_password(&req.old_password, &user.password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        // Log failed password change
        let _ = audit_service
            .log_password_change(
                &claims.sub,
                false,
                None,
                None,
                Some("Invalid old password".to_string()),
            )
            .await;

        return Err((StatusCode::UNAUTHORIZED, "Invalid old password".to_string()));
    }

    // Hash new password
    let new_password_hash = service
        .hash_password(&req.new_password)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update password in database
    use mongodb::bson::{doc, oid::ObjectId};
    let user_id = ObjectId::parse_str(&claims.sub)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let users_collection = state.mongo.collection::<mongodb::bson::Document>("users");
    users_collection
        .update_one(
            doc! { "_id": user_id },
            doc! {
                "$set": {
                    "password_hash": new_password_hash,
                    "updatedAt": mongodb::bson::DateTime::now()
                }
            },
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to update password: {}", e),
            )
        })?;

    tracing::info!("Password changed successfully for user_id: {}", claims.sub);

    // Log successful password change
    let _ = audit_service
        .log_password_change(&claims.sub, true, None, None, None)
        .await;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "message": "Password changed successfully" })),
    ))
}

/// GET /api/v1/users - List all users with filters (admin only)
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ListUsersQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use mongodb::bson::{doc, Document};

    tracing::debug!("Listing users with filters: {:?}", query);

    let users_collection = state.mongo.collection::<User>("users");

    // Build filter document
    let mut filter = Document::new();

    if let Some(role) = &query.role {
        filter.insert("role", role);
    }

    if let Some(group_id) = &query.group_id {
        filter.insert("group_ids", doc! { "$in": [group_id] });
    }

    if let Some(is_blocked) = query.is_blocked {
        filter.insert("is_blocked", is_blocked);
    }

    if let Some(search) = &query.search {
        filter.insert(
            "$or",
            vec![
                doc! { "email": { "$regex": search, "$options": "i" } },
                doc! { "name": { "$regex": search, "$options": "i" } },
            ],
        );
    }

    // Pagination
    let limit = query.limit.unwrap_or(50).min(100) as i64;
    let offset = query.offset.unwrap_or(0) as u64;

    let mut cursor = users_collection
        .find(filter)
        .limit(limit)
        .skip(offset)
        .await
        .map_err(|e| {
            tracing::error!("Failed to query users: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    use futures::stream::TryStreamExt;
    let mut users = Vec::new();
    while let Some(user) = cursor.try_next().await.map_err(|e| {
        tracing::error!("Failed to read user from cursor: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })? {
        users.push(UserProfile::from(user));
    }

    Ok(Json(users))
}

/// GET /api/v1/users/:id - Get user details by ID (admin only)
pub async fn get_user_by_id_admin(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    tracing::debug!("Getting user by ID: {}", user_id);

    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    let user = service
        .get_user_by_id(&user_id)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    Ok(Json(UserProfile::from(user)))
}

/// PATCH /api/v1/users/:id - Update user (admin only)
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
    AppJson(req): AppJson<UpdateUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate request
    if let Err(e) = req.validate() {
        return Err((StatusCode::BAD_REQUEST, format!("Validation error: {}", e)));
    }

    tracing::info!("Updating user: {}", user_id);

    use mongodb::bson::{doc, oid::ObjectId, Document};

    let object_id = ObjectId::parse_str(&user_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid user ID: {}", e)))?;

    // Build update document
    let mut update_fields = Document::new();

    if let Some(name) = &req.name {
        update_fields.insert("name", name);
    }

    if let Some(role) = &req.role {
        update_fields.insert("role", role.as_str());
    }

    if let Some(group_ids) = &req.group_ids {
        update_fields.insert("group_ids", group_ids);
    }

    if let Some(is_blocked) = req.is_blocked {
        update_fields.insert("is_blocked", is_blocked);
    }

    update_fields.insert("updatedAt", mongodb::bson::DateTime::now());

    if update_fields.len() <= 1 {
        return Err((StatusCode::BAD_REQUEST, "No fields to update".to_string()));
    }

    let users_collection = state.mongo.collection::<User>("users");
    let result = users_collection
        .update_one(doc! { "_id": object_id }, doc! { "$set": update_fields })
        .await
        .map_err(|e| {
            tracing::error!("Failed to update user: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    if result.matched_count == 0 {
        return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
    }

    tracing::info!("User updated successfully: {}", user_id);

    // Fetch and return updated user
    let jwt_service = JwtService::new_with_fallbacks(
        &state.config.jwt_secret,
        &state.config.jwt_fallback_secrets,
    );
    let service = AuthService::new(state.mongo.clone(), state.redis.clone(), jwt_service);

    let updated_user = service
        .get_user_by_id(&user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(UserProfile::from(updated_user)))
}

/// GET /api/v1/auth/csrf-token - Get CSRF token for authenticated requests
/// Returns CSRF token in both JSON response and as a cookie
pub async fn get_csrf_token() -> Result<impl IntoResponse, (StatusCode, String)> {
    use crate::middlewares::csrf::{generate_csrf_token, set_csrf_cookie};
    use axum::response::Response;

    tracing::debug!("Generating CSRF token");

    let token = generate_csrf_token();

    // Create JSON response
    let json_response = Json(serde_json::json!({
        "csrf_token": token
    }));

    // Convert to response and set cookie
    let response: Response = (StatusCode::OK, json_response).into_response();
    let response_with_cookie = set_csrf_cookie(response, &token);

    Ok(response_with_cookie)
}
