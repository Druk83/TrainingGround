use anyhow::Result;
use chrono::Utc;
use mongodb::{
    bson::{doc, oid::ObjectId, Bson, Document},
    Client as MongoClient,
};
use redis::Client as RedisClient;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use trainingground_api::{
    config::Config,
    middlewares::auth::JwtClaims,
    models::content::{
        EmbeddingRebuildRequest, LevelCreateRequest, LevelDifficulty, RuleCreateRequest,
        TemplateCreateRequest, TopicCreateRequest,
    },
    services::{content_service::ContentService, AppState},
};

async fn build_test_state() -> Result<(Arc<AppState>, ContentService, JwtClaims)> {
    dotenvy::from_filename(".env.test").ok();
    let config = Config::load()?;
    let mongo_client = MongoClient::with_uri_str(&config.mongo_uri).await?;
    let redis_client = RedisClient::open(config.redis_uri.clone())?;
    let state = Arc::new(AppState::new(config.clone(), mongo_client, redis_client).await?);
    let now = Utc::now();
    let claims = JwtClaims {
        sub: Uuid::new_v4().to_string(),
        role: "content_admin".to_string(),
        group_ids: vec![],
        iat: now.timestamp() as usize,
        exp: (now.timestamp() + 3600) as usize,
    };
    Ok((state.clone(), ContentService::new(&state), claims))
}

#[tokio::test]
async fn integration_template_workflow_approval() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Integration Topic".to_string(),
                description: "Topic for template workflow test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_hex(),
                name: "Integration Level".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Level used in integration test".to_string(),
                min_pass_percent: Some(70),
                order: None,
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Integration Rule".to_string(),
                category: "Integration".to_string(),
                description: "Rule for template workflow test".to_string(),
                examples: vec!["Example A".to_string()],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_hex(),
                rule_ids: vec![rule.id.to_hex()],
                params: json!({ "type": "text_input" }),
                metadata: json!({ "correct_answer": "42" }),
                content: "What is the answer to life?".to_string(),
                difficulty: Some("A1".to_string()),
                source_refs: vec!["integration-test".to_string()],
            },
            &claims,
        )
        .await?;

    assert_eq!(
        template.status,
        trainingground_api::models::content::TemplateStatus::Draft
    );

    let pending = service
        .submit_template_for_moderation(
            &mongodb::bson::oid::ObjectId::parse_str(&template.id)?,
            &claims,
        )
        .await?;
    assert_eq!(
        pending.status,
        trainingground_api::models::content::TemplateStatus::PendingReview
    );

    let reviewed = service
        .approve_template(
            &mongodb::bson::oid::ObjectId::parse_str(&template.id)?,
            &claims,
        )
        .await?;
    assert_eq!(
        reviewed.status,
        trainingground_api::models::content::TemplateStatus::ReviewedOnce
    );

    let ready = service
        .approve_template(
            &mongodb::bson::oid::ObjectId::parse_str(&template.id)?,
            &claims,
        )
        .await?;
    assert_eq!(
        ready.status,
        trainingground_api::models::content::TemplateStatus::Ready
    );

    Ok(())
}

#[tokio::test]
async fn integration_embeddings_rebuild_selected_templates() -> Result<()> {
    let (state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Embedding Topic".to_string(),
                description: "Topic for embeddings test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_hex(),
                name: "Embedding Level".to_string(),
                difficulty: LevelDifficulty::A2,
                description: "Level for embeddings test".to_string(),
                min_pass_percent: Some(75),
                order: None,
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Embedding Rule".to_string(),
                category: "Embedding".to_string(),
                description: "Rule for embedding test".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("embed-template-{}", Uuid::new_v4()),
                level_id: level.id.to_hex(),
                rule_ids: vec![rule.id.to_hex()],
                params: json!({ "type": "text_input" }),
                metadata: json!({ "correct_answer": "42" }),
                content: "Compute embeddings".to_string(),
                difficulty: Some("A2".to_string()),
                source_refs: vec!["embedding-test".to_string()],
            },
            &claims,
        )
        .await?;

    let job = service
        .rebuild_embeddings(EmbeddingRebuildRequest {
            mode: "selected".to_string(),
            template_ids: Some(vec![template.id.clone()]),
        })
        .await?;

    assert_eq!(job.total, 1);
    let collection = state.mongo.collection::<Document>("embedding_jobs");
    let job_id = ObjectId::parse_str(&job.id)?;
    let record = collection
        .find_one(doc! { "_id": job_id })
        .await?
        .expect("Expected embedding job record");
    assert_eq!(record.get_str("mode").unwrap(), "selected");
    let ids = record
        .get_array("template_ids")
        .unwrap()
        .iter()
        .map(|b| match b {
            Bson::ObjectId(oid) => oid.to_hex(),
            _ => panic!("Expected ObjectId"),
        })
        .collect::<Vec<_>>();
    assert_eq!(ids, vec![template.id]);

    Ok(())
}
