use axum::{
    extract::Request,
    http::{header::HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

pub const TRACE_ID_HEADER: &str = "x-trace-id";

#[derive(Clone, Debug)]
pub struct RequestTraceContext {
    pub trace_id: String,
}

/// Ensures every request/response pair carries a trace identifier so that logs,
/// metrics and external systems (Loki/ELK) can correlate actions with users.
pub async fn trace_context_middleware(mut request: Request, next: Next) -> Response {
    let trace_id = request
        .headers()
        .get(TRACE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    request.extensions_mut().insert(RequestTraceContext {
        trace_id: trace_id.clone(),
    });

    if request.headers().get(TRACE_ID_HEADER).is_none() {
        if let Ok(header_value) = HeaderValue::from_str(&trace_id) {
            request
                .headers_mut()
                .insert(HeaderName::from_static(TRACE_ID_HEADER), header_value);
        }
    }

    let mut response = next.run(request).await;

    if response.headers().get(TRACE_ID_HEADER).is_none() {
        if let Ok(value) = HeaderValue::from_str(&trace_id) {
            response
                .headers_mut()
                .insert(HeaderName::from_static(TRACE_ID_HEADER), value);
        }
    }

    response
}
