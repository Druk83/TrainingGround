use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use validator::Validate;

use crate::{
    middlewares::auth::JwtClaims,
    models::user::{
        BlockUserRequest, CreateUserRequest, ListUsersQuery, UpdateUserRequest,
    },
    services::{
        audit_service::AuditService, user_management_service::UserManagementService, AppState,
    },
};

/// POST /admin/users - Создать пользователя (Admin)
pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(req): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Валидация
    req.validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Создание пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let created_user = user_service
        .create_user(req.clone())
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

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
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());

    let users = user_service
        .list_users(query)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(users))
}

/// GET /admin/users/:id - Получить пользователя
pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());

    let user = user_service
        .get_user(&user_id)
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                (StatusCode::NOT_FOUND, e.to_string())
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            }
        })?;

    Ok(Json(user))
}

/// PATCH /admin/users/:id - Обновить пользователя
pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(user_id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Валидация
    req.validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Обновление пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let updated_user = user_service
        .update_user(&user_id, req.clone())
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                (StatusCode::NOT_FOUND, e.to_string())
            } else {
                (StatusCode::BAD_REQUEST, e.to_string())
            }
        })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let changes = format!(
        "name: {}, role: {}, group_ids: {}, is_blocked: {}",
        req.name.as_deref().unwrap_or("unchanged"),
        req.role.as_ref().map(|r| r.as_str()).unwrap_or("unchanged"),
        req.group_ids.as_ref().map(|_| "updated").unwrap_or("unchanged"),
        req.is_blocked.as_ref().map(|b| b.to_string()).unwrap_or("unchanged".to_string()),
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
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Получение email для audit log (до удаления)
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let user = user_service
        .get_user(&user_id)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    let email = user.email.clone();

    // Удаление пользователя
    user_service
        .delete_user(&user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
    Json(req): Json<BlockUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Валидация
    req.validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Блокировка пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let blocked_user = user_service
        .block_user(&user_id, req.clone())
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                (StatusCode::NOT_FOUND, e.to_string())
            } else {
                (StatusCode::BAD_REQUEST, e.to_string())
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
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Разблокировка пользователя
    let user_service = UserManagementService::new(state.mongo.clone(), state.redis.clone());
    let unblocked_user = user_service
        .unblock_user(&user_id)
        .await
        .map_err(|e| {
            if e.to_string().contains("not found") {
                (StatusCode::NOT_FOUND, e.to_string())
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            }
        })?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_user_unblock(&claims.sub, &user_id, None, None)
        .await;

    Ok(Json(unblocked_user))
}
