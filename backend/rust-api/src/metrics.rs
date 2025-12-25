use lazy_static::lazy_static;
use prometheus::{
    register_counter_vec, register_histogram_vec, register_int_counter_vec, register_int_gauge,
    CounterVec, Encoder, HistogramVec, IntCounterVec, IntGauge, TextEncoder,
};

lazy_static! {
    // HTTP Metrics
    pub static ref HTTP_REQUESTS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "http_requests_total",
        "Total number of HTTP requests",
        &["method", "path", "status"]
    )
    .unwrap();

    pub static ref HTTP_REQUEST_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "http_request_duration_seconds",
        "HTTP request duration in seconds",
        &["method", "path"],
        vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    )
    .unwrap();

    // Database Metrics (MongoDB)
    pub static ref DB_OPERATIONS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "db_operations_total",
        "Total number of database operations",
        &["operation", "collection", "status"]
    )
    .unwrap();

    pub static ref DB_OPERATION_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "db_operation_duration_seconds",
        "Database operation duration in seconds",
        &["operation", "collection"],
        vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
    )
    .unwrap();

    // Cache Metrics (Redis)
    pub static ref CACHE_OPERATIONS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "cache_operations_total",
        "Total number of cache operations",
        &["operation", "status"]
    )
    .unwrap();

    pub static ref CACHE_HIT_RATIO: CounterVec = register_counter_vec!(
        "cache_hit_ratio",
        "Cache hit/miss ratio",
        &["result"]
    )
    .unwrap();

    pub static ref CACHE_OPERATION_DURATION_SECONDS: HistogramVec = register_histogram_vec!(
        "cache_operation_duration_seconds",
        "Cache operation duration in seconds",
        &["operation"],
        vec![0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1]
    )
    .unwrap();

    // Business Metrics
    pub static ref SESSIONS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "sessions_total",
        "Total number of training sessions",
        &["status"]
    )
    .unwrap();

    pub static ref SESSIONS_ACTIVE: IntGauge = register_int_gauge!(
        "sessions_active",
        "Number of currently active sessions"
    )
    .unwrap();

    pub static ref ANSWERS_SUBMITTED_TOTAL: IntCounterVec = register_int_counter_vec!(
        "answers_submitted_total",
        "Total number of answers submitted",
        &["correct"]
    )
    .unwrap();

    pub static ref HINTS_REQUESTED_TOTAL: IntCounterVec = register_int_counter_vec!(
        "hints_requested_total",
        "Total number of hints requested",
        &["hint_level"]
    )
    .unwrap();

    pub static ref SSE_CONNECTIONS_ACTIVE: IntGauge = register_int_gauge!(
        "sse_connections_active",
        "Number of active SSE connections"
    )
    .unwrap();

    // Anticheat Metrics
    pub static ref ANTICHEAT_VIOLATIONS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "anticheat_violations_total",
        "Total number of anticheat violations detected",
        &["violation_type"]
    )
    .unwrap();

    pub static ref ANALYTICS_WORKER_TICKS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "analytics_worker_ticks_total",
        "Total number of analytics worker ticks",
        &["status"]
    )
    .unwrap();

    pub static ref EXPORT_WORKER_TICKS_TOTAL: IntCounterVec = register_int_counter_vec!(
        "export_worker_ticks_total",
        "Total number of export worker ticks",
        &["status"]
    )
    .unwrap();

    pub static ref EXPORTS_GENERATED_TOTAL: IntCounterVec = register_int_counter_vec!(
        "exports_generated_total",
        "Total number of exports generated",
        &["format"]
    )
    .unwrap();
}

/// Renders all metrics in Prometheus text format
pub fn render_metrics() -> Result<String, prometheus::Error> {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer)?;
    String::from_utf8(buffer)
        .map_err(|e| prometheus::Error::Msg(format!("Failed to convert metrics to UTF-8: {}", e)))
}

/// Helper: track database operation with metrics
pub async fn track_db_operation<F, T>(
    operation: &str,
    collection: &str,
    future: F,
) -> Result<T, anyhow::Error>
where
    F: std::future::Future<Output = Result<T, anyhow::Error>>,
{
    let start = std::time::Instant::now();
    let result = future.await;
    let duration = start.elapsed().as_secs_f64();

    let status = if result.is_ok() { "success" } else { "error" };

    DB_OPERATIONS_TOTAL
        .with_label_values(&[operation, collection, status])
        .inc();

    DB_OPERATION_DURATION_SECONDS
        .with_label_values(&[operation, collection])
        .observe(duration);

    result
}

/// Helper: track cache operation with metrics
pub async fn track_cache_operation<F, T>(operation: &str, future: F) -> Result<T, anyhow::Error>
where
    F: std::future::Future<Output = Result<T, anyhow::Error>>,
{
    let start = std::time::Instant::now();
    let result = future.await;
    let duration = start.elapsed().as_secs_f64();

    let status = if result.is_ok() { "success" } else { "error" };

    CACHE_OPERATIONS_TOTAL
        .with_label_values(&[operation, status])
        .inc();

    CACHE_OPERATION_DURATION_SECONDS
        .with_label_values(&[operation])
        .observe(duration);

    result
}

/// Record cache hit
pub fn record_cache_hit() {
    CACHE_HIT_RATIO.with_label_values(&["hit"]).inc();
}

/// Record cache miss
pub fn record_cache_miss() {
    CACHE_HIT_RATIO.with_label_values(&["miss"]).inc();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_registration() {
        // Just verify that all metrics are properly registered
        let _ = HTTP_REQUESTS_TOTAL
            .with_label_values(&["GET", "/health", "200"])
            .get();
    }

    #[test]
    fn test_render_metrics() {
        // Increment a counter to ensure we have some data
        HTTP_REQUESTS_TOTAL
            .with_label_values(&["GET", "/test", "200"])
            .inc();

        let result = render_metrics();
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("http_requests_total"));
    }
}
