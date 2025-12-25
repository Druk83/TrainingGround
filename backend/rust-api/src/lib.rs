#![allow(dead_code)]

use axum::{
    extract::Request,
    http::{header, HeaderValue, Method},
    middleware::{self, Next},
    response::Response,
    routing::{get, post, put},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

pub mod config;
pub mod handlers;
pub mod metrics;
pub mod middlewares;
pub mod models;
pub mod services;
pub mod utils;

pub use config::Config;
pub use services::AppState;

/// CSP middleware adds Content-Security-Policy header to all responses
async fn csp_middleware(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; \
             script-src 'self' 'unsafe-inline'; \
             style-src 'self' 'unsafe-inline'; \
             img-src 'self' data: https:; \
             connect-src 'self'",
        ),
    );
    response
}

pub fn create_router(app_state: std::sync::Arc<services::AppState>) -> Router {
    // CORS configuration for reporting endpoints
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_origin(tower_http::cors::Any); // TODO: restrict to specific origins in production

    Router::new()
        // Public endpoints (no auth required)
        .route("/health", get(handlers::health_check))
        // Metrics endpoint with Basic Auth protection
        .route(
            "/metrics",
            get(handlers::metrics_handler)
                .layer(middleware::from_fn(handlers::metrics_auth_middleware)),
        )
        // Protected endpoints (require JWT)
        .nest(
            "/api/v1/sessions",
            sessions_routes().layer(middleware::from_fn_with_state(
                app_state.clone(),
                middlewares::rate_limit::rate_limit_middleware,
            )),
        )
        .nest(
            "/stats",
            reporting_routes()
                .layer(cors) // Apply CORS to reporting endpoints
                .layer(middleware::from_fn_with_state(
                    app_state.clone(),
                    middlewares::auth::auth_middleware,
                )),
        )
        .nest(
            "/admin",
            admin_routes()
                .layer(middleware::from_fn_with_state(
                    app_state.clone(),
                    middlewares::auth::auth_middleware,
                ))
                .layer(middleware::from_fn(
                    middlewares::auth::admin_guard_middleware,
                )),
        )
        .with_state(app_state)
        .layer(middleware::from_fn(csp_middleware)) // Apply CSP to all responses
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

fn reporting_routes() -> Router<std::sync::Arc<services::AppState>> {
    Router::new()
        .route("/groups/{id}", get(handlers::reporting::get_group_stats))
        .route("/users/{id}", get(handlers::reporting::get_user_stats))
        .route("/topics/{id}", get(handlers::reporting::get_topic_stats))
        .route(
            "/groups/{id}/export",
            post(handlers::reporting::request_group_export),
        )
}

fn admin_routes() -> Router<std::sync::Arc<services::AppState>> {
    Router::new()
        .route(
            "/templates",
            get(handlers::admin::list_templates).post(handlers::admin::create_template),
        )
        .route(
            "/templates/{id}",
            get(handlers::admin::get_template).patch(handlers::admin::update_template),
        )
        .route(
            "/templates/{id}/revert",
            post(handlers::admin::revert_template),
        )
        .route("/queue", get(handlers::admin::queue_status))
        .route("/feature-flags", get(handlers::admin::list_feature_flags))
        .route(
            "/feature-flags/{flag_name}",
            put(handlers::admin::update_feature_flag),
        )
}
