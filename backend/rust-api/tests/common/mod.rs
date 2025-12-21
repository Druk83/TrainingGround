use axum::Router;
use mongodb::bson::doc;
use std::sync::Arc;
use trainingground_api::{config::Config, create_router, services::AppState};

pub async fn create_test_app() -> Router {
    // Initialize tracing for tests
    let _ = tracing_subscriber::fmt()
        .with_test_writer()
        .with_max_level(tracing::Level::DEBUG)
        .try_init();

    // Load test environment from .env.test
    dotenvy::from_filename(".env.test").ok();

    // Load test configuration
    let config = Config::load().expect("Failed to load test configuration");

    eprintln!("Test config loaded - Redis URI: {}", config.redis_uri);

    // Connect to test databases
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .expect("Failed to connect to test MongoDB");

    eprintln!("MongoDB connected");

    let redis_client =
        redis::Client::open(config.redis_uri.clone()).expect("Failed to create test Redis client");

    eprintln!("Redis client created, attempting connection...");

    // Create app state (connection is established inside)
    let app_state = Arc::new(
        AppState::new(config.clone(), mongo_client.clone(), redis_client)
            .await
            .expect("Failed to initialize test app state"),
    );

    eprintln!("AppState initialized successfully");

    // Seed test data
    seed_test_data(&mongo_client, &config.mongo_database).await;

    // Build test router (same as main app)
    create_router(app_state)
}

async fn seed_test_data(mongo_client: &mongodb::Client, db_name: &str) {
    let db = mongo_client.database(db_name);
    let tasks_collection = db.collection::<mongodb::bson::Document>("tasks");

    // Create test task if it doesn't exist
    let task_exists = tasks_collection
        .find_one(doc! { "_id": "test-task" })
        .await
        .unwrap();

    if task_exists.is_none() {
        // Try to insert, ignore duplicate key error (race condition with parallel tests)
        let result = tasks_collection
            .insert_one(doc! {
                "_id": "test-task",
                "title": "Test Task",
                "description": "A test task for integration tests",
                "correct_answer": "42",
                "time_limit_seconds": 300,
                "difficulty": "easy"
            })
            .await;

        match result {
            Ok(_) => eprintln!("Test task seeded in MongoDB"),
            Err(e) => {
                // Ignore duplicate key error (code 11000)
                if let mongodb::error::ErrorKind::Write(mongodb::error::WriteFailure::WriteError(
                    ref we,
                )) = *e.kind
                {
                    if we.code == 11000 {
                        eprintln!("Test task already exists (inserted by parallel test)");
                        return;
                    }
                }
                panic!("Failed to seed test task: {:?}", e);
            }
        }
    }
}
