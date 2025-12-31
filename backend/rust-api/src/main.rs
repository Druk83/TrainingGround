#![allow(dead_code)]

use std::sync::Arc;
use tracing_subscriber::{
    layer::{Layer, SubscriberExt},
    util::SubscriberInitExt,
    EnvFilter,
};
use trainingground_api::{
    config::{Config, LoggingSettings},
    create_router,
    services::AppState,
};

#[tokio::main]
async fn main() {
    // Load configuration (before tracing initialization to respect logging settings)
    let config = Config::load().expect("Failed to load configuration");
    let logging = config.logging.clone();

    // Initialize OpenTelemetry tracer (optional, can be disabled)
    let _tracer = init_telemetry();

    // Initialize tracing with OpenTelemetry layer and project defaults
    init_tracing(&logging);

    tracing::info!("Starting TrainingGround Rust API");

    tracing::info!(
        "Configuration loaded for environment: {:?}",
        std::env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string())
    );

    // Initialize database connections
    let mongo_client = mongodb::Client::with_uri_str(&config.mongo_uri)
        .await
        .expect("Failed to connect to MongoDB");
    tracing::info!("MongoDB connected");

    let redis_client =
        redis::Client::open(config.redis_uri.clone()).expect("Failed to create Redis client");

    // Build application state
    let app_state = Arc::new(
        AppState::new(config, mongo_client, redis_client)
            .await
            .expect("Failed to initialize application state"),
    );

    // Build router
    let app = create_router(app_state);

    // Start server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081").await.unwrap();

    tracing::info!("Server listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.unwrap();

    // Shutdown OpenTelemetry gracefully
    shutdown_telemetry();
}

fn init_telemetry() -> opentelemetry_sdk::trace::Tracer {
    use opentelemetry::trace::TracerProvider as _;
    use opentelemetry::KeyValue;
    use opentelemetry_otlp::WithExportConfig;
    use opentelemetry_sdk::trace::SdkTracerProvider;
    use opentelemetry_sdk::Resource;

    // Check if OTLP endpoint is configured
    let otlp_endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4318".to_string());

    tracing::info!(
        "Initializing OpenTelemetry with OTLP endpoint: {}",
        otlp_endpoint
    );

    // Configure OTLP exporter
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_endpoint(otlp_endpoint)
        .build()
        .expect("Failed to create OTLP exporter");

    // Create resource with service information
    let resource = Resource::builder_empty()
        .with_service_name("trainingground-rust-api")
        .with_attributes(vec![KeyValue::new(
            "service.version",
            env!("CARGO_PKG_VERSION"),
        )])
        .build();

    // Create tracer provider
    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource)
        .build();

    let tracer = provider.tracer("trainingground-api");

    // Set global tracer provider
    opentelemetry::global::set_tracer_provider(provider);

    tracer
}

fn shutdown_telemetry() {
    tracing::info!("Shutting down OpenTelemetry");
    // In opentelemetry 0.31, shutdown is handled by dropping the provider
}

fn init_tracing(logging: &LoggingSettings) {
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(logging.directive()));

    let fmt_layer = if logging.is_json() {
        tracing_subscriber::fmt::layer()
            .json()
            .with_target(false)
            .with_thread_ids(false)
            .boxed()
    } else {
        tracing_subscriber::fmt::layer()
            .with_target(false)
            .with_thread_ids(false)
            .boxed()
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(tracing_opentelemetry::layer())
        .init();
}
