use tracing_subscriber::fmt::init;

use trainingground_api::{
    config::Config,
    services::{analytics_worker::AnalyticsWorker, reporting_service::ReportingService, AppState},
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

    let reporting_service = ReportingService::new(app_state.mongo.clone(), app_state.redis.clone());

    let worker = AnalyticsWorker::new(reporting_service, config);

    worker.run().await?;

    Ok(())
}
