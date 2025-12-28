use crate::config::Config;
use mongodb::{Client as MongoClient, Database};
use redis::aio::ConnectionManager;

use self::object_storage::ObjectStorageClient;

pub struct AppState {
    pub config: Config,
    pub mongo: Database,
    pub redis: ConnectionManager,
    pub object_storage: Option<ObjectStorageClient>,
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

        let object_storage = if let Some(storage_cfg) = config.object_storage.clone() {
            tracing::info!(
                "Initializing object storage client for bucket {}",
                storage_cfg.bucket
            );
            Some(ObjectStorageClient::new(storage_cfg)?)
        } else {
            tracing::warn!("Object storage config is not set, report exports disabled");
            None
        };

        superuser_seed::bootstrap(&config, &mongo).await?;

        Ok(Self {
            config,
            mongo,
            redis,
            object_storage,
        })
    }
}

pub mod analytics_worker;
pub mod answer_service;
pub mod anticheat_service;
pub mod audit_service;
pub mod auth_service;
pub mod content_service;
pub mod export_worker;
pub mod group_service;
pub mod hint_service;
pub mod object_storage;
pub mod reporting_service;
pub mod session_service;
pub mod superuser_seed;
pub mod user_management_service;
