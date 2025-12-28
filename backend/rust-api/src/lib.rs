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
        // Auth endpoints (mixed: some public, some protected)
        .nest("/api/v1/auth", auth_routes(app_state.clone()))
        // Protected endpoints (require JWT)
        .nest(
            "/api/v1/sessions",
            sessions_routes()
                .layer(middleware::from_fn(middlewares::csrf::csrf_middleware))
                .layer(middleware::from_fn_with_state(
                    app_state.clone(),
                    middlewares::rate_limit::rate_limit_middleware,
                )),
        )
        .nest(
            "/stats",
            reporting_routes()
                .layer(cors) // Apply CORS to reporting endpoints
                .layer(middleware::from_fn(middlewares::csrf::csrf_middleware))
                .layer(middleware::from_fn_with_state(
                    app_state.clone(),
                    middlewares::auth::auth_middleware,
                )),
        )
        .nest(
            "/admin",
            admin_routes(app_state.clone())
                .layer(middleware::from_fn(middlewares::csrf::csrf_middleware))
                .layer(middleware::from_fn_with_state(
                    app_state.clone(),
                    middlewares::auth::auth_middleware,
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

fn admin_routes(
    app_state: std::sync::Arc<services::AppState>,
) -> Router<std::sync::Arc<services::AppState>> {
    Router::new()
        // Content management
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
        // Backups
        .route(
            "/backups",
            get(handlers::admin::list_backups).post(handlers::admin::create_backup),
        )
        .route(
            "/backups/{id}/restore",
            post(handlers::admin::restore_backup),
        )
        // User management
        .route(
            "/users",
            get(handlers::admin::list_users).post(handlers::admin::create_user),
        )
        .route("/users/bulk", post(handlers::admin::bulk_user_action))
        .route(
            "/users/{id}",
            get(handlers::admin::get_user)
                .patch(handlers::admin::update_user)
                .delete(handlers::admin::delete_user),
        )
        .route("/users/{id}/block", post(handlers::admin::block_user))
        .route("/users/{id}/unblock", post(handlers::admin::unblock_user))
        .route(
            "/users/{id}/reset-password",
            post(handlers::admin::reset_user_password),
        )
        // Group management
        .route(
            "/groups",
            get(handlers::admin::list_groups).post(handlers::admin::create_group),
        )
        .route("/groups/export", get(handlers::admin::export_groups))
        .route(
            "/groups/{id}",
            get(handlers::admin::get_group)
                .patch(handlers::admin::update_group)
                .delete(handlers::admin::delete_group),
        )
        // Anticheat incidents
        .route("/incidents", get(handlers::admin::list_incidents))
        .route(
            "/incidents/{id}",
            get(handlers::admin::get_incident).put(handlers::admin::update_incident),
        )
        .route(
            "/incidents/{id}/unblock",
            post(handlers::admin::unblock_incident_user),
        )
        // System metrics
        .route("/system/metrics", get(handlers::admin::get_system_metrics))
        // System settings
        .route("/settings", get(handlers::admin::get_system_settings))
        .route(
            "/settings/yandexgpt",
            put(handlers::admin::update_yandexgpt_settings),
        )
        .route("/settings/sso", put(handlers::admin::update_sso_settings))
        .route(
            "/settings/email",
            put(handlers::admin::update_email_settings),
        )
        .route(
            "/settings/anticheat",
            put(handlers::admin::update_anticheat_settings),
        )
        .route(
            "/settings/test/yandexgpt",
            post(handlers::admin::test_yandexgpt_settings),
        )
        .route(
            "/settings/test/sso",
            post(handlers::admin::test_sso_settings),
        )
        .route(
            "/settings/test/email",
            post(handlers::admin::test_email_settings),
        )
        // Audit logs
        .route("/audit", get(handlers::admin::list_audit_logs))
        .route("/audit/export", get(handlers::admin::export_audit_logs))
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            middlewares::rate_limit::admin_rate_limit_middleware,
        ))
        .route_layer(middleware::from_fn(
            middlewares::auth::admin_guard_middleware,
        ))
}

fn auth_routes(
    app_state: std::sync::Arc<services::AppState>,
) -> Router<std::sync::Arc<services::AppState>> {
    // Public routes with rate limiting
    let register_route = Router::new()
        .route("/register", post(handlers::auth::register))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            middlewares::rate_limit::register_rate_limit_middleware,
        ));

    let login_route = Router::new()
        .route("/login", post(handlers::auth::login))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            middlewares::rate_limit::login_rate_limit_middleware,
        ));

    let refresh_route = Router::new().route("/refresh", post(handlers::auth::refresh_token));

    // CSRF token endpoint (public, no auth required)
    let csrf_route = Router::new().route("/csrf-token", get(handlers::auth::get_csrf_token));

    let public_routes = register_route
        .merge(login_route)
        .merge(refresh_route)
        .merge(csrf_route);

    // Protected routes (require JWT auth + CSRF protection)
    let protected_routes = Router::new()
        .route("/me", get(handlers::auth::get_current_user))
        .route("/logout", post(handlers::auth::logout))
        .route("/sessions", get(handlers::auth::get_active_sessions))
        .route(
            "/sessions/revoke",
            post(handlers::auth::revoke_other_sessions),
        )
        .route("/change-password", post(handlers::auth::change_password))
        .route_layer(middleware::from_fn(middlewares::csrf::csrf_middleware))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            middlewares::auth::auth_middleware,
        ));

    // Merge public and protected routes
    public_routes.merge(protected_routes)
}
