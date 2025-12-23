#![allow(dead_code)]

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

pub mod config;
pub mod handlers;
pub mod metrics;
pub mod middlewares;
pub mod models;
pub mod services;
pub mod utils;

pub use config::Config;
pub use services::AppState;

pub fn create_router(app_state: std::sync::Arc<services::AppState>) -> Router {
    Router::new()
        // Public endpoints (no auth required)
        .route("/health", get(handlers::health_check))
        .route("/metrics", get(handlers::metrics_handler))
        // Protected endpoints (require JWT)
        .nest(
            "/api/v1/sessions",
            sessions_routes().layer(middleware::from_fn_with_state(
                app_state.clone(),
                middlewares::rate_limit::rate_limit_middleware,
            )),
        )
        .with_state(app_state)
        .layer(middleware::from_fn(
            middlewares::metrics::metrics_middleware,
        ))
        .layer(TraceLayer::new_for_http())
}

fn sessions_routes() -> Router<std::sync::Arc<services::AppState>> {
    Router::new()
        .route("/", post(handlers::sessions::create_session))
        .route("/{id}", get(handlers::sessions::get_session))
        .route("/{id}/complete", post(handlers::sessions::complete_session))
        .route("/{id}/answers", post(handlers::sessions::submit_answer))
        .route("/{id}/hints", post(handlers::sessions::request_hint))
        .route("/{id}/stream", get(handlers::sse::session_stream))
}
