use crate::config::Config;
use mongodb::{Client as MongoClient, Database};
use redis::aio::ConnectionManager;

pub struct AppState {
    pub config: Config,
    pub mongo: Database,
    pub redis: ConnectionManager,
}

impl AppState {
    pub async fn new(
        config: Config,
        mongo_client: MongoClient,
        redis_client: redis::Client,
    ) -> anyhow::Result<Self> {
        let mongo = mongo_client.database(&config.mongo_database);

        tracing::info!("Attempting to connect to Redis...");

        // Create ConnectionManager with longer timeout
        let redis = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            ConnectionManager::new(redis_client),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Redis connection timeout after 30s"))??;

        tracing::info!("Redis ConnectionManager created, testing with PING...");

        // Test connection
        let mut conn = redis.clone();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            redis::cmd("PING").query_async::<String>(&mut conn),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Redis PING timeout after 5s"))??;

        tracing::info!("Redis connection established successfully");

        Ok(Self {
            config,
            mongo,
            redis,
        })
    }
}

pub mod answer_service;
pub mod anticheat_service;
pub mod hint_service;
pub mod session_service;
