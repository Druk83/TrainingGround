use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use futures::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId, Document},
    options::FindOptions,
    Database,
};
use serde::{Deserialize, Serialize};

use crate::{
    extractors::AppJson,
    middlewares::auth::JwtClaims,
    models::{
        content::{LevelRecord, TemplateDocument, TemplateStatus, TopicRecord},
        CreateSessionRequest, CreateSessionResponse, ProgressSummary,
    },
    services::{session_service::SessionService, AppState},
};

const DEFAULT_TASKS_PER_COURSE: i32 = 10;

#[derive(Debug, Serialize)]
pub struct StudentCoursesResponse {
    pub courses: Vec<StudentCourseSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StudentCourseStatus {
    New,
    InProgress,
    Completed,
}

#[derive(Debug, Serialize)]
pub struct StudentCourseSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub difficulty: String,
    pub level_id: String,
    pub level_name: Option<String>,
    pub topic_id: Option<String>,
    pub topic_name: Option<String>,
    pub status: StudentCourseStatus,
    pub progress: i32,
    pub total_tasks: i32,
    pub completed_tasks: i32,
    pub last_session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StartCourseSessionPayload {
    #[serde(rename = "template_id")]
    pub template_id: String,
}

pub async fn list_courses(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<Json<StudentCoursesResponse>, StudentApiError> {
    ensure_student_role(&claims)?;

    let templates = load_published_templates(&state.mongo).await?;
    if templates.is_empty() {
        return Ok(Json(StudentCoursesResponse {
            courses: Vec::new(),
        }));
    }

    let levels_map = load_levels(&state.mongo, &templates).await?;
    let topics_map = load_topics(&state.mongo, &levels_map).await?;
    let progress_map = load_progress(&state.mongo, &claims.sub).await?;

    let courses = templates
        .into_iter()
        .filter_map(|template| {
            let level = levels_map.get(&template.level_id)?;
            let topic = topics_map.get(&level.topic_id);
            let level_id = template.level_id.to_hex();
            let progress = progress_map.get(&level_id);

            let title = metadata_string(&template.metadata, "title")
                .unwrap_or_else(|| template.slug.clone());
            let description = metadata_string(&template.metadata, "description")
                .unwrap_or_else(|| "Описание будет добавлено позже.".to_string());
            let total_tasks =
                metadata_number(&template.metadata, &["total_tasks", "lessons_count"])
                    .unwrap_or(DEFAULT_TASKS_PER_COURSE);

            let progress_percent = progress
                .map(|value| value.percentage.round() as i32)
                .unwrap_or(0)
                .clamp(0, 100);
            let completed_tasks = (((progress_percent as f64 / 100.0) * f64::from(total_tasks))
                .round() as i32)
                .clamp(0, total_tasks);

            let course = StudentCourseSummary {
                id: template.id.to_hex(),
                slug: template.slug.clone(),
                title,
                description,
                difficulty: map_difficulty(
                    template
                        .difficulty
                        .as_deref()
                        .or_else(|| Some(level.difficulty.as_str())),
                ),
                level_id: level_id.clone(),
                level_name: Some(level.name.clone()),
                topic_id: topic.map(|doc| doc.id.to_hex()),
                topic_name: topic.map(|doc| doc.name.clone()),
                status: determine_status(progress, progress_percent),
                progress: progress_percent,
                total_tasks,
                completed_tasks,
                last_session_id: None,
            };

            Some(course)
        })
        .collect();

    Ok(Json(StudentCoursesResponse { courses }))
}

pub async fn start_session(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    AppJson(payload): AppJson<StartCourseSessionPayload>,
) -> Result<Json<CreateSessionResponse>, StudentApiError> {
    ensure_student_role(&claims)?;

    let template_id = ObjectId::parse_str(&payload.template_id)
        .map_err(|_| StudentApiError::bad_request("Invalid template_id"))?;

    let templates_collection = state.mongo.collection::<TemplateDocument>("templates");
    let template = templates_collection
        .find_one(doc! {
            "_id": &template_id,
            "status": TemplateStatus::Published.as_str()
        })
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to load template: {}", err)))?
        .ok_or_else(|| StudentApiError::not_found("Template not found or not published"))?;

    let session_service = SessionService::new(
        state.mongo.clone(),
        state.redis.clone(),
        state.config.python_api_url.clone(),
    );

    let group_id = claims.group_ids.first().cloned();
    let request = CreateSessionRequest {
        user_id: claims.sub.clone(),
        task_id: template.slug.clone(),
        group_id,
        level_id: Some(template.level_id.to_hex()),
    };

    let response = session_service
        .create_session(request)
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to create session: {}", err)))?;

    Ok(Json(response))
}

#[derive(Debug)]
pub enum StudentApiError {
    BadRequest(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

impl StudentApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        StudentApiError::BadRequest(message.into())
    }

    fn forbidden(message: impl Into<String>) -> Self {
        StudentApiError::Forbidden(message.into())
    }

    fn not_found(message: impl Into<String>) -> Self {
        StudentApiError::NotFound(message.into())
    }

    fn internal(message: impl Into<String>) -> Self {
        StudentApiError::Internal(message.into())
    }
}

impl IntoResponse for StudentApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            StudentApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            StudentApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            StudentApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            StudentApiError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        (status, Json(message)).into_response()
    }
}

async fn load_published_templates(
    mongo: &Database,
) -> Result<Vec<TemplateDocument>, StudentApiError> {
    let collection = mongo.collection::<TemplateDocument>("templates");
    let options = FindOptions::builder()
        .sort(doc! { "published_at": -1, "updatedAt": -1 })
        .limit(200)
        .build();

    let mut cursor = collection
        .find(doc! { "status": TemplateStatus::Published.as_str() })
        .with_options(options)
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to query templates: {}", err)))?;

    let mut templates = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|err| StudentApiError::internal(format!("Template cursor error: {}", err)))?
    {
        templates.push(doc);
    }
    Ok(templates)
}

async fn load_levels(
    mongo: &Database,
    templates: &[TemplateDocument],
) -> Result<HashMap<ObjectId, LevelRecord>, StudentApiError> {
    let mut ids = HashSet::new();
    for template in templates {
        ids.insert(template.level_id);
    }

    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let collection = mongo.collection::<LevelRecord>("levels");
    let mut cursor = collection
        .find(doc! { "_id": { "$in": ids.iter().cloned().collect::<Vec<_>>() } })
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to load levels: {}", err)))?;

    let mut levels = HashMap::new();
    while let Some(level) = cursor
        .try_next()
        .await
        .map_err(|err| StudentApiError::internal(format!("Level cursor error: {}", err)))?
    {
        levels.insert(level.id, level);
    }

    Ok(levels)
}

async fn load_topics(
    mongo: &Database,
    levels: &HashMap<ObjectId, LevelRecord>,
) -> Result<HashMap<ObjectId, TopicRecord>, StudentApiError> {
    let topic_ids: HashSet<ObjectId> = levels.values().map(|level| level.topic_id).collect();
    if topic_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let collection = mongo.collection::<TopicRecord>("topics");
    let mut cursor = collection
        .find(doc! { "_id": { "$in": topic_ids.iter().cloned().collect::<Vec<_>>() } })
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to load topics: {}", err)))?;

    let mut topics = HashMap::new();
    while let Some(topic) = cursor
        .try_next()
        .await
        .map_err(|err| StudentApiError::internal(format!("Topic cursor error: {}", err)))?
    {
        topics.insert(topic.id, topic);
    }
    Ok(topics)
}

async fn load_progress(
    mongo: &Database,
    user_id: &str,
) -> Result<HashMap<String, ProgressSummary>, StudentApiError> {
    let collection = mongo.collection::<ProgressSummary>("progress_summary");
    let mut cursor = collection
        .find(doc! { "user_id": user_id })
        .await
        .map_err(|err| StudentApiError::internal(format!("Failed to load progress: {}", err)))?;

    let mut rows = HashMap::new();
    while let Some(summary) = cursor
        .try_next()
        .await
        .map_err(|err| StudentApiError::internal(format!("Progress cursor error: {}", err)))?
    {
        rows.insert(summary.level_id.clone(), summary);
    }

    Ok(rows)
}

fn ensure_student_role(claims: &JwtClaims) -> Result<(), StudentApiError> {
    if matches!(claims.role.as_str(), "student" | "content_admin" | "admin") {
        Ok(())
    } else {
        Err(StudentApiError::forbidden("Student role required"))
    }
}

fn determine_status(progress: Option<&ProgressSummary>, percent: i32) -> StudentCourseStatus {
    match progress {
        Some(summary) if percent >= 80 && summary.attempts_total > 0 => {
            StudentCourseStatus::Completed
        }
        Some(summary) if summary.attempts_total > 0 => StudentCourseStatus::InProgress,
        _ => StudentCourseStatus::New,
    }
}

fn metadata_string(doc: &Document, key: &str) -> Option<String> {
    doc.get_str(key)
        .map(|value| value.to_string())
        .ok()
        .or_else(|| {
            doc.get(key)
                .and_then(|value| value.as_str().map(|s| s.to_string()))
        })
}

fn metadata_number(doc: &Document, keys: &[&str]) -> Option<i32> {
    for key in keys {
        if let Ok(value) = doc.get_i32(key) {
            return Some(value);
        }
        if let Ok(value) = doc.get_i64(key) {
            return Some(value as i32);
        }
    }
    None
}

fn map_difficulty(value: Option<&str>) -> String {
    match value.map(|s| s.to_ascii_lowercase()) {
        Some(ref v) if v == "easy" || v == "medium" || v == "hard" => v.clone(),
        Some(ref v) if v == "a1" || v == "a2" => "easy".to_string(),
        Some(ref v) if v == "b1" || v == "b2" => "medium".to_string(),
        Some(ref v) if v == "c1" || v == "c2" => "hard".to_string(),
        _ => "medium".to_string(),
    }
}
