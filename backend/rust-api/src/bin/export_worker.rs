use tracing_subscriber::fmt::init;

use trainingground_api::{
    config::Config,
    services::{export_worker::ExportWorker, reporting_service::ReportingService, AppState},
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init();

    let config = Config::load().expect("Failed to load configuration");

    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .expect("Failed to connect to MongoDB");

    let redis_client =
        redis::Client::open(config.redis_uri.clone()).expect("Failed to create Redis client");

    let app_state = AppState::new(config.clone(), mongo_client, redis_client)
        .await
        .expect("Failed to initialize app state");

    let object_storage = app_state
        .object_storage
        .clone()
        .expect("Object storage must be configured for export worker");

    let reporting_service = ReportingService::new(app_state.mongo.clone(), app_state.redis.clone());
    let worker = ExportWorker::new(reporting_service, object_storage, config);

    worker.run().await?;

    Ok(())
}
