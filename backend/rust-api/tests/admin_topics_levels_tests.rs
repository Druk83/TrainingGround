use anyhow::Result;
use chrono::Utc;
use redis::Client as RedisClient;
use std::sync::Arc;
use uuid::Uuid;

use mongodb::Client as MongoClient;
use trainingground_api::{
    config::Config,
    middlewares::auth::JwtClaims,
    models::content::{
        LevelCreateRequest, LevelDifficulty, LevelReorderRequest, LevelStatus, LevelUpdateRequest,
        TopicCreateRequest, TopicStatus, TopicUpdateRequest,
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

// ==================== TOPICS TESTS ====================

#[tokio::test]
async fn test_create_topic_with_valid_data() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Орфография".to_string(),
                description: "Правила орфографии русского языка".to_string(),
                icon_url: Some("https://example.com/icon.png".to_string()),
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(topic.name, "Орфография");
    assert_eq!(topic.status, TopicStatus::Active);

    Ok(())
}

#[tokio::test]
async fn test_create_topic_with_invalid_slug() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let result = service
        .create_topic(
            TopicCreateRequest {
                slug: "invalid slug".to_string(), // Invalid: contains space
                name: "Test Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await;

    assert!(result.is_err());
    Ok(())
}

#[tokio::test]
async fn test_list_topics() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create multiple topics
    service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Topic 1".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Topic 2".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    // List topics
    let topics = service.list_topics().await?;

    assert!(topics.len() >= 2);

    Ok(())
}

#[tokio::test]
async fn test_update_topic() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Original Name".to_string(),
                description: "Original description".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let updated = service
        .update_topic(
            &topic.id,
            TopicUpdateRequest {
                name: Some("Updated Name".to_string()),
                description: Some("Updated description".to_string()),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(updated.name, "Updated Name");
    assert_eq!(updated.description, "Updated description");

    Ok(())
}

#[tokio::test]
async fn test_deactivate_topic() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Active Topic".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    let deactivated = service
        .update_topic(
            &topic.id,
            TopicUpdateRequest {
                name: None,
                description: None,
                icon_url: None,
                status: Some(TopicStatus::Deprecated),
            },
            &claims,
        )
        .await?;

    assert_eq!(deactivated.status, TopicStatus::Deprecated);

    Ok(())
}

#[tokio::test]
async fn test_delete_topic() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let topic = service
        .create_topic(
            TopicCreateRequest {
                slug: format!("topic-{}", Uuid::new_v4()),
                name: "Topic to Delete".to_string(),
                description: "Test".to_string(),
                icon_url: None,
                status: None,
            },
            &claims,
        )
        .await?;

    service.delete_topic(&topic.id, &claims).await?;

    // Soft delete - topic should still exist but might be marked as deleted
    Ok(())
}

// ==================== LEVELS TESTS ====================

#[tokio::test]
async fn test_create_level_with_valid_data() -> Result<()> {
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

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 1: Basic".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Basic level for beginners".to_string(),
                min_pass_percent: Some(75),
                order: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(level.name, "Level 1: Basic");
    assert_eq!(level.status, LevelStatus::Active);

    Ok(())
}

#[tokio::test]
async fn test_list_levels_for_topic() -> Result<()> {
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

    // Create multiple levels
    service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 1".to_string(),
                difficulty: LevelDifficulty::A1,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 2".to_string(),
                difficulty: LevelDifficulty::A2,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    let levels = service.list_levels_for_topic(&topic.id).await?;

    assert_eq!(levels.len(), 2);

    Ok(())
}

#[tokio::test]
async fn test_update_level() -> Result<()> {
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

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Original Name".to_string(),
                difficulty: LevelDifficulty::A1,
                description: "Original".to_string(),
                min_pass_percent: Some(80),
                order: None,
            },
            &claims,
        )
        .await?;

    let updated = service
        .update_level(
            &level.id,
            LevelUpdateRequest {
                name: Some("Updated Name".to_string()),
                description: Some("Updated".to_string()),
                min_pass_percent: Some(75),
                difficulty: None,
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(updated.name, "Updated Name");
    assert_eq!(updated.min_pass_percent, 75i32);

    Ok(())
}

#[tokio::test]
async fn test_delete_level() -> Result<()> {
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

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level to Delete".to_string(),
                difficulty: LevelDifficulty::A1,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    service.delete_level(&level.id, &claims).await?;

    Ok(())
}

#[tokio::test]
async fn test_reorder_levels() -> Result<()> {
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

    // Create three levels
    let level1 = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 1".to_string(),
                difficulty: LevelDifficulty::A1,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    let level2 = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 2".to_string(),
                difficulty: LevelDifficulty::A2,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    let level3 = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 3".to_string(),
                difficulty: LevelDifficulty::B1,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    // Reorder: 3, 1, 2
    service
        .reorder_levels(LevelReorderRequest {
            ordering: vec![
                level3.id.to_string(),
                level1.id.to_string(),
                level2.id.to_string(),
            ],
        })
        .await?;

    // Verify new order
    let levels = service.list_levels_for_topic(&topic.id).await?;

    assert_eq!(levels[0].id.to_string(), level3.id.to_string());
    assert_eq!(levels[1].id.to_string(), level1.id.to_string());
    assert_eq!(levels[2].id.to_string(), level2.id.to_string());

    Ok(())
}

#[tokio::test]
async fn test_level_default_min_pass_percent() -> Result<()> {
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

    let level = service
        .create_level(
            LevelCreateRequest {
                topic_id: topic.id.to_string(),
                name: "Level 1".to_string(),
                difficulty: LevelDifficulty::A1,
                description: String::new(),
                min_pass_percent: None,
                order: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(level.min_pass_percent, 80i32); // Default value

    Ok(())
}

#[tokio::test]
async fn test_create_multiple_difficulty_levels() -> Result<()> {
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

    let difficulties = [
        LevelDifficulty::A1,
        LevelDifficulty::A2,
        LevelDifficulty::B1,
        LevelDifficulty::B2,
    ];

    for (idx, difficulty) in difficulties.iter().enumerate() {
        let level = service
            .create_level(
                LevelCreateRequest {
                    topic_id: topic.id.to_string(),
                    name: format!("Level {}", idx + 1),
                    difficulty: *difficulty,
                    description: String::new(),
                    min_pass_percent: None,
                    order: None,
                },
                &claims,
            )
            .await?;

        assert_eq!(level.difficulty, *difficulty);
    }

    Ok(())
}
