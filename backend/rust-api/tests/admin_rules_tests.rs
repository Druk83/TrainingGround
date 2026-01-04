use anyhow::Result;
use chrono::Utc;
use redis::Client as RedisClient;
use std::sync::Arc;
use uuid::Uuid;

use mongodb::Client as MongoClient;
use trainingground_api::{
    config::Config,
    middlewares::auth::JwtClaims,
    models::content::{RuleCreateRequest, RuleUpdateRequest},
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

// ==================== RULES TESTS ====================

#[tokio::test]
async fn test_create_rule_with_valid_data() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Безударные гласные".to_string(),
                category: "orthography".to_string(),
                description: "Правило для безударных гласных".to_string(),
                examples: vec![
                    "касаться - касание".to_string(),
                    "одеть - надеть".to_string(),
                ],
                exceptions: vec!["исключение 1".to_string()],
                sources: vec!["учебник.pdf".to_string()],
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(rule.name, "Безударные гласные");
    assert_eq!(rule.category, "orthography");
    assert_eq!(rule.examples.len(), 2);

    Ok(())
}

#[tokio::test]
async fn test_create_rule_all_categories() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let categories = ["orthography", "punctuation", "syntax", "morphology"];

    for (idx, category) in categories.iter().enumerate() {
        let rule = service
            .create_rule(
                RuleCreateRequest {
                    slug: format!("rule-{}", Uuid::new_v4()),

                    name: format!("Rule {}", idx + 1),
                    category: category.to_string(),
                    description: "Test rule".to_string(),
                    examples: vec![],
                    exceptions: vec![],
                    sources: vec![],
                    status: None,
                },
                &claims,
            )
            .await?;

        assert_eq!(rule.category, *category);
    }

    Ok(())
}

#[tokio::test]
async fn test_list_rules() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create multiple rules
    service
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

    service
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

    let rules = service.list_rules().await?;

    assert!(rules.len() >= 2);

    Ok(())
}

#[tokio::test]
async fn test_update_rule() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Original Rule".to_string(),
                category: "orthography".to_string(),
                description: "Original description".to_string(),
                examples: vec!["example1".to_string()],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let updated = service
        .update_rule(
            &rule.id,
            RuleUpdateRequest {
                name: Some("Updated Rule".to_string()),
                category: Some("orthography".to_string()),
                description: Some("Updated description".to_string()),
                examples: Some(vec!["example1".to_string(), "example2".to_string()]),
                exceptions: None,
                sources: None,
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(updated.name, "Updated Rule");
    assert_eq!(updated.description, "Updated description");
    assert_eq!(updated.examples.len(), 2);

    Ok(())
}

#[tokio::test]
async fn test_delete_rule() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Rule to Delete".to_string(),
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

    service.delete_rule(&rule.id, &claims).await?;

    Ok(())
}

#[tokio::test]
async fn test_rule_with_markdown_description() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let markdown_desc = r#"
# Правило для безударных гласных

## Определение
Безударные гласные - это гласные звуки в безударных слогах.

## Примеры
- **Слово 1**: это пример
- **Слово 2**: ещё пример

## Исключения
Некоторые слова не подчиняются этому правилу.
"#;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Безударные гласные".to_string(),
                category: "orthography".to_string(),
                description: markdown_desc.to_string(),
                examples: vec!["примеры из текста".to_string()],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    assert!(rule.description.contains("#"));
    assert!(rule.description.contains("Примеры"));

    Ok(())
}

#[tokio::test]
async fn test_rule_with_sources() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let sources = vec![
        "Розенталь Д.Э. Справочник по орфографии".to_string(),
        "ФГОС Русский язык".to_string(),
        "https://academic.ru/".to_string(),
    ];

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Test".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: sources.clone(),
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(rule.sources, sources);

    Ok(())
}

#[tokio::test]
async fn test_rule_with_exceptions() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let exceptions = vec![
        "Исключение 1".to_string(),
        "Исключение 2".to_string(),
        "Исключение 3".to_string(),
    ];

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Test".to_string(),
                examples: vec![],
                exceptions: exceptions.clone(),
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(rule.exceptions, exceptions);

    Ok(())
}

#[tokio::test]
async fn test_filter_rules_by_category() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create rules in different categories
    service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Orthography Rule".to_string(),
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

    service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Punctuation Rule".to_string(),
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

    let all_rules = service.list_rules().await?;

    let orthography_rules: Vec<_> = all_rules
        .iter()
        .filter(|r| r.category == "orthography")
        .collect();

    assert!(!orthography_rules.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_rule_with_empty_examples() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Rule without examples".to_string(),
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

    assert_eq!(rule.examples.len(), 0);

    Ok(())
}

#[tokio::test]
async fn test_rule_update_add_examples() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    let rule = service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Rule".to_string(),
                category: "orthography".to_string(),
                description: "Test".to_string(),
                examples: vec!["example1".to_string()],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let updated = service
        .update_rule(
            &rule.id,
            RuleUpdateRequest {
                name: None,
                category: None,
                description: None,
                examples: Some(vec![
                    "example1".to_string(),
                    "example2".to_string(),
                    "example3".to_string(),
                ]),
                exceptions: None,
                sources: None,
                status: None,
            },
            &claims,
        )
        .await?;

    assert_eq!(updated.examples.len(), 3);

    Ok(())
}

#[tokio::test]
async fn test_rule_coverage_statistics() -> Result<()> {
    let (_state, service, claims) = build_test_state().await?;

    // Create a rule
    service
        .create_rule(
            RuleCreateRequest {
                slug: format!("rule-{}", Uuid::new_v4()),

                name: "Coverage Test Rule".to_string(),
                category: "orthography".to_string(),
                description: "Test for coverage".to_string(),
                examples: vec![],
                exceptions: vec![],
                sources: vec![],
                status: None,
            },
            &claims,
        )
        .await?;

    let all_rules = service.list_rules().await?;

    // Should have at least our created rule
    assert!(!all_rules.is_empty());

    Ok(())
}
