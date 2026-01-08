use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct GenerateInstancesRequest {
    pub level_id: String,
    pub count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default)]
    pub allow_reuse: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GenerateInstancesResponse {
    pub instances: Vec<TaskInstance>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TaskInstance {
    pub task_id: String,
    pub text: String,
    pub correct_answer: String,
    pub options: Option<Vec<String>>,
    pub metadata: serde_json::Value,
}

pub async fn request_instances(
    client: &Client,
    python_api_url: &str,
    payload: &GenerateInstancesRequest,
) -> Result<Vec<TaskInstance>> {
    let url = format!("{}/internal/generate_instances", python_api_url);

    let response = client
        .post(&url)
        .json(payload)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .context("Failed to call Template Generator API")?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(anyhow!(
            "Template Generator returned error {}: {}",
            status,
            error_text
        ));
    }

    let api_response: GenerateInstancesResponse = response
        .json()
        .await
        .context("Failed to parse Template Generator response")?;

    Ok(api_response.instances)
}
