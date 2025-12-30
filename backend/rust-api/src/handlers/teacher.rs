use std::{
    collections::{HashMap, HashSet},
    convert::TryFrom,
    sync::Arc,
};

use anyhow::Context;
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use mongodb::bson::{doc, from_document, oid::ObjectId, Document};
use mongodb::{options::FindOptions, Database};
use serde::{Deserialize, Serialize};

use crate::{
    middlewares::auth::JwtClaims,
    models::{notification::NotificationTemplate, notification::SentNotification, ProgressSummary},
    services::{
        email_service::EmailService, group_service::GroupService,
        reporting_service::ReportingService, AppState,
    },
};

#[derive(Debug, Serialize)]
pub struct StudentSummary {
    pub id: String,
    pub name: String,
    pub email: String,
    pub accuracy: Option<f64>,
    pub total_attempts: Option<u32>,
    pub total_score: Option<i32>,
    pub last_progress_at: Option<DateTime<Utc>>,
    pub last_login_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct StudentDetailResponse {
    pub summary: StudentSummary,
    pub progress: Vec<ProgressSummary>,
}

#[derive(Debug, Deserialize)]
struct StudentRecord {
    #[serde(rename = "_id")]
    id: ObjectId,
    name: String,
    email: String,
    #[serde(rename = "lastLoginAt")]
    last_login_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct StudentStatRow {
    #[serde(rename = "_id")]
    user_id: String,
    #[serde(default)]
    avg_percentage: Option<f64>,
    #[serde(default)]
    total_attempts: Option<i64>,
    #[serde(default)]
    total_score: Option<i64>,
    #[serde(rename = "last_updated")]
    last_updated: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
pub struct GroupQuery {
    #[serde(rename = "groupId")]
    pub group_id: String,
}

#[derive(Serialize)]
struct TopicAnalyticsResponse {
    topic_id: String,
    topic_name: Option<String>,
    avg_percentage: Option<f64>,
    total_attempts: Option<i64>,
    total_score: Option<i64>,
}

#[derive(Serialize)]
struct ActivityPoint {
    date: String,
    avg_percentage: Option<f64>,
    total_attempts: Option<i64>,
    total_score: Option<i64>,
}

#[derive(Serialize)]
struct Recommendation {
    topic_id: String,
    topic_name: Option<String>,
    avg_percentage: Option<f64>,
}

pub async fn list_teacher_groups(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_service = GroupService::new(state.mongo.clone());
    let groups = group_service
        .fetch_groups_by_ids(&claims.group_ids)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    Ok(Json(groups))
}

pub async fn list_group_students(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path(group_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_obj = parse_object_id(&group_id, "group_id")?;
    let reporting_service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    reporting_service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| {
            (
                StatusCode::FORBIDDEN,
                "Access denied for this group".to_string(),
            )
        })?;

    let group_id_str = group_obj.to_hex();
    let students = fetch_students_in_group(&state.mongo, &group_id_str).await?;
    let user_ids = students
        .iter()
        .map(|student| student.id.to_hex())
        .collect::<Vec<_>>();
    let stats_map = aggregate_student_stats(&state.mongo, &user_ids)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let summaries = students
        .into_iter()
        .map(|record| {
            let stats = stats_map.get(&record.id.to_hex());
            student_summary_from_record(record, stats)
        })
        .collect::<Vec<_>>();

    Ok(Json(summaries))
}

pub async fn get_student_detail(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Path((group_id, student_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_obj = parse_object_id(&group_id, "group_id")?;
    let reporting_service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    reporting_service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| {
            (
                StatusCode::FORBIDDEN,
                "Access denied for this group".to_string(),
            )
        })?;

    let student_obj = parse_object_id(&student_id, "student_id")?;
    let group_id_str = group_obj.to_hex();

    let student_record = fetch_single_student(&state.mongo, &student_obj, &group_id_str).await?;

    let progress = reporting_service
        .load_user_progress(&student_obj)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let stats_map = aggregate_student_stats(&state.mongo, &[student_record.id.to_hex()])
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let summary = student_summary_from_record(student_record, stats_map.get(&student_id));

    Ok(Json(StudentDetailResponse { summary, progress }))
}

pub async fn list_group_topic_analytics(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Query(query): Query<GroupQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_obj = parse_object_id(&query.group_id, "groupId")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| (StatusCode::FORBIDDEN, "Access denied".into()))?;

    let students = fetch_students_in_group(&state.mongo, &group_obj.to_hex()).await?;
    let student_ids = students
        .into_iter()
        .map(|record| record.id.to_hex())
        .collect::<Vec<_>>();
    if student_ids.is_empty() {
        return Ok(Json(Vec::<TopicAnalyticsResponse>::new()));
    }

    let topic_rows = service
        .aggregate_topic_stats(&student_ids)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let payload = topic_rows
        .into_iter()
        .map(|row| TopicAnalyticsResponse {
            topic_id: row.topic_id.to_hex(),
            topic_name: row.topic_name,
            avg_percentage: row.avg_percentage,
            total_attempts: row.total_attempts,
            total_score: row.total_score,
        })
        .collect::<Vec<_>>();

    Ok(Json(payload))
}

pub async fn get_group_activity(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Query(query): Query<GroupQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_obj = parse_object_id(&query.group_id, "groupId")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| (StatusCode::FORBIDDEN, "Access denied".into()))?;

    let students = fetch_students_in_group(&state.mongo, &group_obj.to_hex()).await?;
    let student_ids = students
        .into_iter()
        .map(|record| record.id.to_hex())
        .collect::<Vec<_>>();
    if student_ids.is_empty() {
        return Ok(Json(Vec::<ActivityPoint>::new()));
    }

    let activity_points = service
        .aggregate_activity(&student_ids)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let payload = activity_points
        .into_iter()
        .map(|point| ActivityPoint {
            date: point.date,
            avg_percentage: point.avg_percentage,
            total_attempts: point.total_attempts,
            total_score: point.total_score,
        })
        .collect::<Vec<_>>();

    Ok(Json(payload))
}

pub async fn get_recommendations(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Query(query): Query<GroupQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;

    let group_obj = parse_object_id(&query.group_id, "groupId")?;
    let service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| (StatusCode::FORBIDDEN, "Access denied".into()))?;

    let students = fetch_students_in_group(&state.mongo, &group_obj.to_hex()).await?;
    let student_ids = students
        .into_iter()
        .map(|record| record.id.to_hex())
        .collect::<Vec<_>>();
    if student_ids.is_empty() {
        return Ok(Json(Vec::<Recommendation>::new()));
    }

    let recs = service
        .aggregate_recommendations(&student_ids)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let payload = recs
        .into_iter()
        .map(|rec| Recommendation {
            topic_id: rec.topic_id.to_hex(),
            topic_name: rec.topic_name,
            avg_percentage: rec.avg_percentage,
        })
        .collect::<Vec<_>>();

    Ok(Json(payload))
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    name: String,
    subject: String,
    body: String,
}

#[derive(Debug, Serialize)]
struct TemplateResponse {
    id: String,
    name: String,
    subject: String,
    body: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SendNotificationRequest {
    #[serde(rename = "groupId")]
    group_id: String,
    #[serde(rename = "templateId")]
    template_id: String,
    #[serde(default, rename = "studentIds")]
    student_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct SendNotificationResponse {
    sent: usize,
    #[serde(rename = "emailDisabled")]
    email_disabled: bool,
}

#[derive(Debug, Serialize)]
struct NotificationHistoryEntry {
    id: String,
    #[serde(rename = "templateId")]
    template_id: String,
    #[serde(rename = "templateName")]
    template_name: Option<String>,
    subject: String,
    sent_at: DateTime<Utc>,
    #[serde(rename = "recipientsCount")]
    recipients_count: usize,
    status: String,
}

pub async fn list_notification_templates(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;
    let teacher_id = parse_object_id(&claims.sub, "teacher_id")?;

    let collection = state
        .mongo
        .collection::<NotificationTemplate>("notification_templates");
    let mut cursor = collection
        .find(doc! { "teacher_id": &teacher_id })
        .with_options(
            FindOptions::builder()
                .sort(doc! { "createdAt": -1 })
                .build(),
        )
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let mut templates = Vec::new();
    while let Some(template) = cursor
        .try_next()
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
    {
        templates.push(template_to_response(&template));
    }

    Ok(Json(templates))
}

pub async fn create_notification_template(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<CreateTemplateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;
    if payload.name.trim().is_empty()
        || payload.subject.trim().is_empty()
        || payload.body.trim().is_empty()
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Name, subject and body are required".into(),
        ));
    }

    let teacher_id = parse_object_id(&claims.sub, "teacher_id")?;
    let collection = state
        .mongo
        .collection::<NotificationTemplate>("notification_templates");

    let now = Utc::now();
    let template = NotificationTemplate {
        id: ObjectId::new(),
        teacher_id,
        name: payload.name.trim().to_string(),
        subject: payload.subject.trim().to_string(),
        body: payload.body.trim().to_string(),
        created_at: now,
        updated_at: now,
    };
    collection
        .insert_one(template.clone())
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    Ok(Json(template_to_response(&template)))
}

pub async fn list_notification_history(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;
    let teacher_id = parse_object_id(&claims.sub, "teacher_id")?;

    let collection = state
        .mongo
        .collection::<SentNotification>("sent_notifications");
    let mut cursor = collection
        .find(doc! { "teacher_id": &teacher_id })
        .with_options(
            FindOptions::builder()
                .sort(doc! { "sentAt": -1 })
                .limit(50)
                .build(),
        )
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let mut rows = Vec::new();
    let mut template_ids = HashSet::new();
    while let Some(entry) = cursor
        .try_next()
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
    {
        template_ids.insert(entry.template_id);
        rows.push(entry);
    }

    let template_names = load_template_names(&state.mongo, &template_ids).await?;

    let payload = rows
        .into_iter()
        .map(|entry| NotificationHistoryEntry {
            id: entry.id.to_hex(),
            template_id: entry.template_id.to_hex(),
            template_name: template_names.get(&entry.template_id).cloned(),
            subject: entry.subject,
            sent_at: entry.sent_at,
            recipients_count: entry.recipients.len(),
            status: entry.status,
        })
        .collect::<Vec<_>>();

    Ok(Json(payload))
}

pub async fn send_group_notification(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<JwtClaims>,
    Json(payload): Json<SendNotificationRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    ensure_teacher_role(&claims)?;
    let teacher_id = parse_object_id(&claims.sub, "teacher_id")?;
    let group_obj = parse_object_id(&payload.group_id, "groupId")?;
    let template_obj = parse_object_id(&payload.template_id, "templateId")?;

    let student_filter = parse_student_ids(&payload.student_ids)?;

    let reporting_service = ReportingService::new(state.mongo.clone(), state.redis.clone());
    reporting_service
        .guard_group_access(&claims, &group_obj)
        .map_err(|_| (StatusCode::FORBIDDEN, "Access denied for this group".into()))?;

    let template_collection = state
        .mongo
        .collection::<NotificationTemplate>("notification_templates");
    let template = template_collection
        .find_one(doc! { "_id": &template_obj, "teacher_id": &teacher_id })
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Template not found".into()))?;

    let group_service = GroupService::new(state.mongo.clone());
    let group = group_service
        .get_group(&group_obj.to_hex())
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    let group_name = group.name;

    let students = fetch_students_in_group(&state.mongo, &group_obj.to_hex()).await?;
    let recipients = if let Some(filter) = student_filter {
        students
            .into_iter()
            .filter(|student| filter.contains(&student.id))
            .collect::<Vec<_>>()
    } else {
        students
    };

    if recipients.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No recipients found for this notification".into(),
        ));
    }

    let email_service = EmailService::new(state.mongo.clone());
    let email_disabled = EmailService::sending_disabled();
    let mut sent = 0usize;
    for student in &recipients {
        let subject = apply_template(&template.subject, student, &group_name);
        let body = apply_template(&template.body, student, &group_name);
        if !email_disabled {
            email_service
                .send_notification_email(&student.email, &student.name, &subject, &body)
                .await
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
        }
        sent += 1;
    }

    let history_collection = state
        .mongo
        .collection::<SentNotification>("sent_notifications");
    let recipient_ids = recipients
        .iter()
        .map(|student| student.id)
        .collect::<Vec<_>>();
    let history_entry = SentNotification {
        id: ObjectId::new(),
        teacher_id,
        template_id: template_obj,
        recipients: recipient_ids,
        subject: template.subject.clone(),
        body: template.body.clone(),
        sent_at: Utc::now(),
        status: if email_disabled { "skipped" } else { "sent" }.to_string(),
    };
    history_collection
        .insert_one(history_entry)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    Ok(Json(SendNotificationResponse {
        sent,
        email_disabled,
    }))
}

fn template_to_response(template: &NotificationTemplate) -> TemplateResponse {
    TemplateResponse {
        id: template.id.to_hex(),
        name: template.name.clone(),
        subject: template.subject.clone(),
        body: template.body.clone(),
        created_at: template.created_at,
        updated_at: template.updated_at,
    }
}

fn parse_student_ids(ids: &[String]) -> Result<Option<HashSet<ObjectId>>, (StatusCode, String)> {
    if ids.is_empty() {
        return Ok(None);
    }
    let mut parsed = HashSet::new();
    for value in ids {
        let id = ObjectId::parse_str(value).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                format!("Invalid student ID: {}", value),
            )
        })?;
        parsed.insert(id);
    }
    Ok(Some(parsed))
}

async fn load_template_names(
    db: &Database,
    ids: &HashSet<ObjectId>,
) -> Result<HashMap<ObjectId, String>, (StatusCode, String)> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let collection = db.collection::<NotificationTemplate>("notification_templates");
    let id_list = ids.iter().cloned().collect::<Vec<_>>();
    let mut cursor = collection
        .find(doc! { "_id": { "$in": id_list } })
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let mut map = HashMap::new();
    while let Some(template) = cursor
        .try_next()
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
    {
        map.insert(template.id, template.name);
    }
    Ok(map)
}

fn apply_template(text: &str, student: &StudentRecord, group_name: &str) -> String {
    text.replace("{student_name}", &student.name)
        .replace("{group_name}", group_name)
}

fn ensure_teacher_role(claims: &JwtClaims) -> Result<(), (StatusCode, String)> {
    if claims.role == "teacher" || claims.role == "admin" {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, "Teacher role required".to_string()))
    }
}

fn parse_object_id(value: &str, field: &str) -> Result<ObjectId, (StatusCode, String)> {
    ObjectId::parse_str(value).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("Invalid {}: must be ObjectId", field),
        )
    })
}

async fn fetch_students_in_group(
    db: &Database,
    group_id: &str,
) -> Result<Vec<StudentRecord>, (StatusCode, String)> {
    let users_collection = db.collection::<Document>("users");
    let filter = doc! {
        "group_ids": group_id,
        "role": "student",
    };
    let mut cursor = users_collection
        .find(filter)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let mut records = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
    {
        let record = from_document::<StudentRecord>(doc)
            .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
        records.push(record);
    }

    Ok(records)
}

async fn fetch_single_student(
    db: &Database,
    student_id: &ObjectId,
    group_id: &str,
) -> Result<StudentRecord, (StatusCode, String)> {
    let users_collection = db.collection::<Document>("users");
    let filter = doc! {
        "_id": student_id,
        "group_ids": group_id,
        "role": "student",
    };
    let student_doc = users_collection
        .find_one(filter)
        .await
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "Student not found in this group".to_string(),
            )
        })?;

    from_document::<StudentRecord>(student_doc)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))
}

fn student_summary_from_record(
    record: StudentRecord,
    stats: Option<&StudentStatRow>,
) -> StudentSummary {
    StudentSummary {
        id: record.id.to_hex(),
        name: record.name,
        email: record.email,
        accuracy: stats.and_then(|row| row.avg_percentage),
        total_attempts: stats
            .and_then(|row| row.total_attempts)
            .and_then(|value| u32::try_from(value).ok()),
        total_score: stats
            .and_then(|row| row.total_score)
            .and_then(|value| i32::try_from(value).ok()),
        last_progress_at: stats.and_then(|row| row.last_updated),
        last_login_at: record.last_login_at,
    }
}

async fn aggregate_student_stats(
    db: &Database,
    user_ids: &[String],
) -> anyhow::Result<HashMap<String, StudentStatRow>> {
    if user_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let pipeline = vec![
        doc! {
            "$match": {
                "user_id": { "$in": user_ids },
            }
        },
        doc! {
            "$group": {
                "_id": "$user_id",
                "avg_percentage": { "$avg": "$percentage" },
                "total_attempts": { "$sum": "$attempts_total" },
                "total_score": { "$sum": "$score" },
                "last_updated": { "$max": "$updated_at" },
            }
        },
    ];

    let collection = db.collection::<Document>("progress_summary");
    let mut cursor = collection
        .aggregate(pipeline)
        .await
        .context("Failed to aggregate student stats")?;

    let mut stats_map = HashMap::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .context("Failed to read aggregation row")?
    {
        let stat: StudentStatRow =
            from_document(doc).context("Failed to deserialize student stat row")?;
        stats_map.insert(stat.user_id.clone(), stat);
    }

    Ok(stats_map)
}
