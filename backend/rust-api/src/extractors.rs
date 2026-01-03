use axum::{
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// Custom JSON extractor that returns JSON error responses instead of HTML
pub struct AppJson<T>(pub T);

impl<T, S> FromRequest<S> for AppJson<T>
where
    T: serde::de::DeserializeOwned + 'static,
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(req, state).await {
            Ok(Json(value)) => Ok(AppJson(value)),
            Err(rejection) => {
                let message = format!("Failed to parse JSON request body: {}", rejection);
                tracing::warn!("{}", message);
                let error_response = json!({
                    "message": message,
                    "status": 400
                });
                Err((StatusCode::BAD_REQUEST, Json(error_response)).into_response())
            }
        }
    }
}
