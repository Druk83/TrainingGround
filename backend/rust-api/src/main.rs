#![allow(dead_code)]

use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use trainingground_api::{config::Config, create_router, services::AppState};

#[tokio::main]
async fn main() {
    // Initialize OpenTelemetry tracer (optional, can be disabled)
    let _tracer = init_telemetry();

    // Initialize tracing with OpenTelemetry layer
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trainingground_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_opentelemetry::layer())
        .init();

    tracing::info!("Starting TrainingGround Rust API");

    // Load configuration
    let config = Config::load().expect("Failed to load configuration");
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
