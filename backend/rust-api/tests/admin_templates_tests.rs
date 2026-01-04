use anyhow::Result;
use chrono::Utc;
use redis::Client as RedisClient;
use std::sync::Arc;
use uuid::Uuid;

use mongodb::bson::oid::ObjectId;
use mongodb::Client as MongoClient;
use trainingground_api::{
    config::Config,
    middlewares::auth::JwtClaims,
    models::content::{
        LevelCreateRequest, LevelDifficulty, RuleCreateRequest, TemplateCreateRequest,
        TemplateListQuery, TemplateStatus, TemplateUpdateRequest, TopicCreateRequest,
    },
    services::{content_service::ContentService, AppState},
};

async fn build_test_state() -> Result<(Arc<AppState>, ContentService, JwtClaims)> {
    dotenvy::from_filename(".env.test").ok();
    let config = Config::load()?;
    let mongo_client = MongoClient::with_uri_str(&config.mongo_uri).await?;
    let redis_client = RedisClient::open(config.redis_uri.clone())?;
    let state: Arc<AppState> =
        Arc::new(AppState::new(config.clone(), mongo_client, redis_client).await?);
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

// ==================== TEMPLATES TESTS ====================

#[tokio::test]
async fn test_create_template_with_valid_data() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup: Create topic and level first
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Topic for templates".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Beginner".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Beginner level".to_string(),
                min_pass_percent: Some(70),
                order: Some(1),
            },
            &claims,
        )
        .await?;

    // Create a rule for the template
    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec!["example1".to_string()],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    // Create template
    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Template content".to_string(),
                difficulty: Some("A1".to_string()),
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    assert!(!template.slug.is_empty());
    assert_eq!(template.status, TemplateStatus::Draft);

    Ok(())
}

#[tokio::test]
async fn test_list_templates() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create topic and level
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 1".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    // Create a rule for the template
    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    // Create template
    service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Content".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    let templates = service
        .list_templates(TemplateListQuery {
            status: None,
            topic_id: None,
            level_id: None,
            difficulty: None,
            version: None,
            q: None,
            limit: None,
        })
        .await?;
    assert!(!templates.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_update_template() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::A2,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
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
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({"old": "value"}),
                metadata: serde_json::json!({}),
                content: "Original content".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Update template
    let _updated = service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: None,
                params: Some(serde_json::json!({"new": "value"})),
                metadata: None,
                content: Some("Updated content".to_string()),
                difficulty: Some("B1".to_string()),
                source_refs: None,
            },
            &claims,
        )
        .await?;

    // Verify update by fetching full template
    let detail = service
        .get_template(&template.id.parse::<ObjectId>()?)
        .await?;
    assert!(detail.is_some());
    let detail = detail.unwrap();
    assert_eq!(detail.content, "Updated content");
    assert_eq!(detail.difficulty, Some("B1".to_string()));

    Ok(())
}

#[tokio::test]
async fn test_delete_template() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::B1,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
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
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Content to deprecate".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Workflow: Draft → PendingReview → ReviewedOnce → Ready → Published → Deprecated
    service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("pendingreview".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("reviewedonce".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("ready".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("published".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    // Finally deprecate
    service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("deprecated".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    Ok(())
}

#[tokio::test]
async fn test_template_with_rule_references() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create rules
    let rule1 = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Rule 1".to_string(),
                category: "orthography".to_string(),
                description: "Test".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let rule2 = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Rule 2".to_string(),
                category: "punctuation".to_string(),
                description: "Test".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    // Create topic and level
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::B2,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    // Create template with multiple rule references
    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule1.id.to_string(), rule2.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Template with multiple rules".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Verify template was created with correct rule references
    let detail = service
        .get_template(&template.id.parse::<ObjectId>()?)
        .await?;
    assert!(detail.is_some());
    let detail = detail.unwrap();
    assert_eq!(detail.rule_ids.len(), 2);

    Ok(())
}

#[tokio::test]
async fn test_template_with_params() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let _level2 = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 2".to_string(),
                difficulty: LevelDifficulty::A2,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(2),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let params = serde_json::json!({
        "question_count": 5,
        "time_limit": 300,
        "difficulty_level": "medium"
    });

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: params.clone(),
                metadata: serde_json::json!({}),
                content: "Template with params".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Verify params were stored correctly
    let detail = service
        .get_template(&template.id.parse::<ObjectId>()?)
        .await?;
    assert!(detail.is_some());
    let detail = detail.unwrap();

    // Convert Value to Document for comparison
    let params_doc = mongodb::bson::to_document(&params).unwrap();
    assert_eq!(detail.params, params_doc);

    Ok(())
}

#[tokio::test]
async fn test_template_with_metadata() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::A2,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let metadata = serde_json::json!({
        "author": "test_author",
        "version": "1.0",
        "tags": ["beginner", "russian"]
    });

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: metadata.clone(),
                content: "Template with metadata".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Verify metadata was stored correctly
    let detail = service
        .get_template(&template.id.parse::<ObjectId>()?)
        .await?;
    assert!(detail.is_some());
    let detail = detail.unwrap();

    // Convert Value to Document for comparison
    let metadata_doc = mongodb::bson::to_document(&metadata).unwrap();
    assert_eq!(detail.metadata, metadata_doc);

    Ok(())
}

#[tokio::test]
async fn test_template_status_transitions() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::B1,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
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
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Template for status test".to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Verify initial status is Draft
    assert_eq!(template.status, TemplateStatus::Draft);

    // Update to PendingReview
    let updated = service
        .update_template(
            &template.id.parse::<ObjectId>()?,
            TemplateUpdateRequest {
                status: Some("pendingreview".to_string()),
                params: None,
                metadata: None,
                content: None,
                difficulty: None,
                source_refs: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(updated.status, TemplateStatus::PendingReview);

    Ok(())
}

#[tokio::test]
async fn test_template_with_difficulty_levels() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let difficulties = ["A1", "A2", "B1", "B2"];

    for (idx, diff) in difficulties.iter().enumerate() {
        let level = service
            .create_level(
                LevelCreateRequest {
                    topic_id: topic.id.to_string(),
                    name: format!("Level {}", idx + 1),
                    difficulty: LevelDifficulty::A1, // just a placeholder
                    description: "Test".to_string(),
                    min_pass_percent: None,
                    order: Some((idx + 1) as i32),
                },
                &claims,
            )
            .await?;

        let template = service
            .create_template(
                TemplateCreateRequest {
                    slug: format!("template-{}-{}", diff, Uuid::new_v4()),
                    level_id: level.id.to_string(),
                    rule_ids: vec![rule.id.to_string()],
                    params: serde_json::json!({}),
                    metadata: serde_json::json!({}),
                    content: format!("Template for {}", diff),
                    difficulty: Some(diff.to_string()),
                    source_refs: vec![],
                },
                &claims,
            )
            .await?;

        assert_eq!(template.difficulty, Some(diff.to_string()));
    }

    Ok(())
}

#[tokio::test]
async fn test_template_with_source_references() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::B2,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let source_refs = vec![
        "https://example.com/source1".to_string(),
        "https://example.com/source2".to_string(),
    ];

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: "Template with sources".to_string(),
                difficulty: None,
                source_refs: source_refs.clone(),
            },
            &claims,
        )
        .await?;

    assert_eq!(template.source_refs, source_refs);

    Ok(())
}

#[tokio::test]
async fn test_template_content_preservation() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Setup
    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Test".to_string(),
                min_pass_percent: None,
                order: Some(1),
            },
            &claims,
        )
        .await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Rule for testing".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let long_content = "This is a template with complex content. It contains multiple sentences.\
                        It may have special characters like @, #, $, %, &. \
                        It should preserve all formatting and content exactly as provided.";

    let template = service
        .create_template(
            TemplateCreateRequest {
                slug: format!("template-{}", Uuid::new_v4()),
                level_id: level.id.to_string(),
                rule_ids: vec![rule.id.to_string()],
                params: serde_json::json!({}),
                metadata: serde_json::json!({}),
                content: long_content.to_string(),
                difficulty: None,
                source_refs: vec![],
            },
            &claims,
        )
        .await?;

    // Verify content was preserved correctly
    let detail = service
        .get_template(&template.id.parse::<ObjectId>()?)
        .await?;
    assert!(detail.is_some());
    let detail = detail.unwrap();
    assert_eq!(detail.content, long_content);

    Ok(())
}
