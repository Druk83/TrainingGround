use axum::{
    extract::{Extension, Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;
use validator::Validate;

use crate::{
    middlewares::auth::JwtClaims,
    models::group::{CreateGroupRequest, ListGroupsQuery, UpdateGroupRequest},
    services::{audit_service::AuditService, group_service::GroupService, AppState},
};

/// POST /admin/groups - Создать группу
pub async fn create_group(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Валидация
    req.validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Создание группы
    let group_service = GroupService::new(state.mongo.clone());
    let created_group = group_service
        .create_group(req.clone())
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_group_create(
            &claims.sub,
            &created_group.id,
            &created_group.name,
            &created_group.school,
            None,
            None,
        )
        .await;

    Ok((StatusCode::CREATED, Json(created_group)))
}

/// GET /admin/groups - Список групп
pub async fn list_groups(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListGroupsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let group_service = GroupService::new(state.mongo.clone());

    let groups = group_service
        .list_groups(query)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(groups))
}

/// GET /admin/groups/:id - Получить группу
pub async fn get_group(
    State(state): State<Arc<AppState>>,
    Path(group_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let group_service = GroupService::new(state.mongo.clone());

    let group = group_service.get_group(&group_id).await.map_err(|e| {
        if e.to_string().contains("not found") {
            (StatusCode::NOT_FOUND, e.to_string())
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        }
    })?;

    Ok(Json(group))
}

/// PATCH /admin/groups/:id - Обновить группу
pub async fn update_group(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(group_id): Path<String>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Валидация
    req.validate()
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Обновление группы
    let group_service = GroupService::new(state.mongo.clone());
    let updated_group = group_service
        .update_group(&group_id, req.clone())
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
        "name: {}, school: {}, curator_id: {}, description: {}",
        req.name.as_deref().unwrap_or("unchanged"),
        req.school.as_deref().unwrap_or("unchanged"),
        req.curator_id
            .as_ref()
            .map(|_| "updated")
            .unwrap_or("unchanged"),
        req.description
            .as_ref()
            .map(|_| "updated")
            .unwrap_or("unchanged"),
    );

    let _ = audit_service
        .log_group_update(&claims.sub, &group_id, &changes, None, None)
        .await;

    Ok(Json(updated_group))
}

/// DELETE /admin/groups/:id - Удалить группу
pub async fn delete_group(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(group_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Получение имени для audit log (до удаления)
    let group_service = GroupService::new(state.mongo.clone());
    let group = group_service
        .get_group(&group_id)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    let group_name = group.name.clone();

    // Удаление группы
    group_service
        .delete_group(&group_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Audit log
    let audit_service = AuditService::new(state.mongo.clone());
    let _ = audit_service
        .log_group_delete(&claims.sub, &group_id, &group_name, None, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /admin/groups/export - Экспорт всех групп в CSV
pub async fn export_groups(
    State(state): State<Arc<AppState>>,
) -> Result<Response, (StatusCode, String)> {
    let group_service = GroupService::new(state.mongo.clone());
    let groups = group_service
        .export_groups()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut csv = String::from("id,name,school,curator_name,student_count,created_at\n");

    for group in groups {
        let id = escape_csv(&group.id);
        let name = escape_csv(&group.name);
        let school = escape_csv(&group.school);
        let curator = escape_csv(group.curator_name.as_deref().unwrap_or(""));
        let count = group.student_count.to_string();
        let created_at = escape_csv(&group.created_at.to_rfc3339());

        csv.push_str(&format!(
            "{id},{name},{school},{curator},{count},{created_at}\n"
        ));
    }

    let mut response = Response::new(csv.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"groups-export.csv\""),
    );

    Ok(response)
}

fn escape_csv(value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        format!("\"{}\"", value.replace('"', "\"\""))
    }
}
