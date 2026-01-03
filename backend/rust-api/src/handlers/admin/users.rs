use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use validator::Validate;

use crate::{
    extractors::AppJson,
    middlewares::auth::JwtClaims,
    models::user::{
        BlockUserRequest, BulkUserActionRequest, CreateUserRequest, ListUsersQuery,
        UpdateUserRequest, UserDetailResponse,
    },
    services::{
        audit_service::AuditService, email_service::EmailService,
        user_management_service::UserManagementService, AppState,
    },
};
use rand::{distr::Alphanumeric, Rng};

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        ApiError::BadRequest(message.into())
    }

    fn not_found(message: impl Into<String>) -> Self {
        ApiError::NotFound(message.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::Internal(err.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        let json_response = serde_json::json!({
            "message": message,
            "status": status.as_u16()
        });
        (status, Json(json_response)).into_response()
    }
}

/// POST /admin/users - Создать пользователя (Admin)
/// POST /admin/users - Создать пользователя (Admin)
pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(req): AppJson<CreateUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Валидация
    req.validate()
        .map_err(|e| ApiError::bad_request(format!("Validation error: {}", e)))?;

    // Создание пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let created_user = user_service.create_user(req.clone()).await.map_err(|e| {
        tracing::error!("Failed to create user: {:?}", e);
        ApiError::bad_request(e.to_string())
    })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_create(
            &claims.sub,
            &created_user.id,
            &created_user.email,
            created_user.role.as_str(),
            None, // @todo #A6-01:30min Извлечь IP из request headers
            None, // @todo #A6-01:30min Извлечь User-Agent из request headers
        )
        .await;

    Ok((StatusCode::CREATED, Json(created_user)))
}

/// GET /admin/users - Список пользователей
pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListUsersQuery>,
) -> Result<Json<Vec<UserDetailResponse>>, ApiError> {
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());

    let users = user_service
        .list_users(query)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(users))
}

/// GET /admin/users/:id - Получить пользователя
pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<Json<UserDetailResponse>, ApiError> {
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());

    let user = user_service.get_user(&user_id).await.map_err(|e| {
        if e.to_string().contains("not found") {
            ApiError::not_found(e.to_string())
        } else {
            ApiError::Internal(e.to_string())
        }
    })?;

    Ok(Json(user))
}

/// PATCH /admin/users/:id - Обновить пользователя
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
    AppJson(req): AppJson<UpdateUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Валидация
    req.validate()
        .map_err(|e| ApiError::bad_request(e.to_string()))?;

    // Обновление пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let updated_user = user_service
        .update_user(&user_id, req.clone())
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                ApiError::not_found(e.to_string())
            } else {
                ApiError::bad_request(e.to_string())
            }
        })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let changes = format!(
        "name: {}, role: {}, group_ids: {}, is_blocked: {}",
        req.name.as_deref().unwrap_or("unchanged"),
        req.role.as_ref().map(|r| r.as_str()).unwrap_or("unchanged"),
        req.group_ids
            .as_ref()
            .map(|_| "updated")
            .unwrap_or("unchanged"),
        req.is_blocked
            .as_ref()
            .map(|b| b.to_string())
            .unwrap_or("unchanged".to_string()),
    );

    let _ = audit_service
        .log_user_update(&claims.sub, &user_id, changes, None, None)
        .await;

    Ok(Json(updated_user))
}

/// DELETE /admin/users/:id - Удалить пользователя
pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    // Получение email для audit log (до удаления)
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let user = user_service
        .get_user(&user_id)
        .await
        .map_err(|e| ApiError::not_found(e.to_string()))?;

    let email = user.email.clone();

    // Удаление пользователя
    user_service
        .delete_user(&user_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_delete(&claims.sub, &user_id, &email, None, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /admin/users/:id/block - Заблокировать пользователя
pub async fn block_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
    AppJson(req): AppJson<BlockUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Валидация
    req.validate()
        .map_err(|e| ApiError::bad_request(e.to_string()))?;

    // Блокировка пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let blocked_user = user_service
        .block_user(&user_id, req.clone())
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                ApiError::not_found(e.to_string())
            } else {
                ApiError::bad_request(e.to_string())
            }
        })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_block(
            &claims.sub,
            &user_id,
            &req.reason,
            req.duration_hours,
            None,
            None,
        )
        .await;

    Ok(Json(blocked_user))
}

/// POST /admin/users/:id/unblock - Разблокировать пользователя
pub async fn unblock_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    // Разблокировка пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let unblocked_user = user_service.unblock_user(&user_id).await.map_err(|e| {
        if e.to_string().contains("not found") {
            ApiError::not_found(e.to_string())
        } else {
            ApiError::Internal(e.to_string())
        }
    })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_unblock(&claims.sub, &user_id, None, None)
        .await;

    Ok(Json(unblocked_user))
}

/// POST /admin/users/:id/reset-password - Сбросить пароль и отправить по email
pub async fn reset_user_password(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let temp_password = generate_temp_password();
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let updated_user = user_service
        .reset_password(&user_id, &temp_password)
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                ApiError::not_found(e.to_string())
            } else {
                ApiError::bad_request(e.to_string())
            }
        })?;

    let email_service = EmailService::new(state.mongo.clone());
    let email_disabled = EmailService::sending_disabled();

    if !email_disabled {
        email_service
            .send_password_reset_email(&updated_user.email, &updated_user.name, &temp_password)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
    } else {
        tracing::warn!(
            "Email sending disabled, temporary password returned in response for {}",
            updated_user.email
        );
    }

    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_password_change(&claims.sub, true, None, None, None)
        .await;

    let mut payload = serde_json::json!({ "status": "ok" });
    if email_disabled {
        payload["temporary_password"] = temp_password.clone().into();
    }

    Ok(Json(payload))
}

fn generate_temp_password() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(12)
        .map(char::from)
        .collect()
}

/// POST /admin/users/bulk - Массовые операции (блокировка, разблокировка, смена групп)
pub async fn bulk_user_action(
    State(state): State<Arc<AppState>>,
    AppJson(req): AppJson<BulkUserActionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if req.user_ids.is_empty() {
        return Err(ApiError::bad_request("user_ids cannot be empty"));
    }

    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let result = user_service
        .bulk_user_action(req)
        .await
        .map_err(|e| ApiError::bad_request(e.to_string()))?;

    Ok(Json(result))
}
