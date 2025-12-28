use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use hex;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::Client;
use sha2::{Digest, Sha256};
use url::Url;

use crate::config::ObjectStorageSettings;

type HmacSha256 = Hmac<Sha256>;

const AWS_URI_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

#[derive(Clone, Debug)]
pub struct ObjectStorageClient {
    bucket: String,
    region: String,
    endpoint: Url,
    access_key: String,
    secret_key: String,
    prefix: String,
}

impl ObjectStorageClient {
    pub fn new(settings: ObjectStorageSettings) -> Result<Self> {
        let endpoint = settings
            .endpoint
            .unwrap_or_else(|| "https://storage.yandexcloud.net".to_string());

        let endpoint = Url::parse(&endpoint).context("Invalid object storage endpoint URL")?;
        if endpoint.host_str().is_none() {
            bail!("Object storage endpoint must include a host");
        }

        // Enforce HTTPS in production mode (check APP_ENV at runtime)
        let app_env = std::env::var("APP_ENV").unwrap_or_else(|_| "prod".to_string());
        if app_env == "prod" && endpoint.scheme() != "https" {
            bail!(
                "Object storage endpoint must use HTTPS in production mode. Got: {}",
                endpoint.scheme()
            );
        }

        // In development, allow both HTTP and HTTPS
        if endpoint.scheme() != "https" && endpoint.scheme() != "http" {
            bail!(
                "Invalid endpoint scheme: {}. Must be http or https.",
                endpoint.scheme()
            );
        }

        Ok(Self {
            bucket: settings.bucket,
            region: settings.region,
            access_key: settings.access_key,
            secret_key: settings.secret_key,
            endpoint,
            prefix: sanitize_prefix(&settings.reports_prefix),
        })
    }

    pub async fn upload_bytes(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<()> {
        let object_key = self.full_key(key);
        let canonical_uri = self.canonical_uri(&object_key);

        let payload_hash = hex::encode(Sha256::digest(&bytes));
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();
        let scope = format!("{}/{}/s3/aws4_request", date_stamp, self.region);

        let host = self
            .endpoint
            .host_str()
            .ok_or_else(|| anyhow!("Object storage endpoint missing host"))?
            .to_lowercase();

        let canonical_headers = format!(
            "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
            host, payload_hash, amz_date
        );
        let signed_headers = "host;x-amz-content-sha256;x-amz-date";

        let canonical_request = format!(
            "PUT\n{}\n\n{}\n{}\n{}",
            canonical_uri, canonical_headers, signed_headers, payload_hash
        );

        let hashed_canonical_request = hex::encode(Sha256::digest(canonical_request.as_bytes()));
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date, scope, hashed_canonical_request
        );

        let signing_key = derive_signing_key(&self.secret_key, &date_stamp, &self.region, "s3");
        let signature = hex::encode(hmac_sign(&signing_key, string_to_sign.as_bytes()));

        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.access_key, scope, signed_headers, signature
        );

        let mut upload_url = self.endpoint.clone();
        upload_url.set_path(&format!(
            "{}/{}",
            self.bucket,
            object_key
                .split('/')
                .map(|segment| utf8_percent_encode(segment, AWS_URI_ENCODE_SET).to_string())
                .collect::<Vec<_>>()
                .join("/")
        ));

        Client::new()
            .put(upload_url)
            .header("Authorization", authorization)
            .header("x-amz-date", amz_date)
            .header("x-amz-content-sha256", payload_hash)
            .header("content-type", content_type)
            .body(bytes)
            .send()
            .await
            .with_context(|| format!("Failed to upload object {}", object_key))?
            .error_for_status()
            .context("Object storage upload returned error status")?;

        Ok(())
    }

    pub fn build_export_key(&self, group_id: &str, export_id: &str, extension: &str) -> String {
        let timestamp = Utc::now().format("%Y%m%dT%H%M%S");
        let ext = extension.trim_start_matches('.');
        format!(
            "groups/{group_id}/export-{export_id}-{timestamp}.{ext}",
            group_id = group_id,
            export_id = export_id,
            timestamp = timestamp,
            ext = ext
        )
    }

    fn full_key(&self, key: &str) -> String {
        let cleaned = key.trim_matches('/');
        if self.prefix.is_empty() {
            cleaned.to_string()
        } else if cleaned.is_empty() {
            self.prefix.clone()
        } else {
            format!("{}/{}", self.prefix, cleaned)
        }
    }

    fn canonical_uri(&self, key: &str) -> String {
        let encoded_key = key
            .split('/')
            .map(|segment| utf8_percent_encode(segment, AWS_URI_ENCODE_SET).to_string())
            .collect::<Vec<_>>()
            .join("/");

        format!("/{}/{}", self.bucket, encoded_key)
    }

    fn canonical_query_string(params: &BTreeMap<String, String>) -> String {
        params
            .iter()
            .map(|(key, value)| {
                format!(
                    "{}={}",
                    utf8_percent_encode(key, AWS_URI_ENCODE_SET),
                    utf8_percent_encode(value, AWS_URI_ENCODE_SET)
                )
            })
            .collect::<Vec<_>>()
            .join("&")
    }

    pub fn generate_presigned_download_url(&self, key: &str, ttl: Duration) -> Result<String> {
        let ttl_secs = ttl.as_secs().min(604800) as u32;
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();
        let scope = format!("{}/{}/s3/aws4_request", date_stamp, self.region);
        let object_key = self.full_key(key);
        let canonical_uri = self.canonical_uri(&object_key);

        let mut params = BTreeMap::new();
        params.insert("X-Amz-Algorithm".into(), "AWS4-HMAC-SHA256".into());
        params.insert(
            "X-Amz-Credential".into(),
            format!("{}/{}", self.access_key, scope),
        );
        params.insert("X-Amz-Date".into(), amz_date.clone());
        params.insert("X-Amz-Expires".into(), ttl_secs.to_string());
        params.insert("X-Amz-SignedHeaders".into(), "host".into());

        let canonical_query = Self::canonical_query_string(&params);
        let host = self
            .endpoint
            .host_str()
            .ok_or_else(|| anyhow!("Object storage endpoint missing host"))?
            .to_lowercase();

        let canonical_headers = format!("host:{}\n", host);
        let signed_headers = "host";
        let payload_hash = "UNSIGNED-PAYLOAD";

        let canonical_request = format!(
            "GET\n{}\n{}\n{}\n{}\n{}",
            canonical_uri, canonical_query, canonical_headers, signed_headers, payload_hash
        );

        let hashed_canonical_request = Sha256::digest(canonical_request.as_bytes());
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            scope,
            hex::encode(hashed_canonical_request)
        );

        let signing_key = derive_signing_key(&self.secret_key, &date_stamp, &self.region, "s3");
        let signature = hex::encode(hmac_sign(&signing_key, string_to_sign.as_bytes()));

        let mut final_query = params;
        final_query.insert("X-Amz-Signature".into(), signature);
        let query_with_signature = Self::canonical_query_string(&final_query);

        let mut url = self.endpoint.clone();
        url.set_path(&format!(
            "{}/{}",
            self.bucket,
            object_key
                .split('/')
                .map(|segment| utf8_percent_encode(segment, AWS_URI_ENCODE_SET).to_string())
                .collect::<Vec<_>>()
                .join("/")
        ));
        url.set_query(Some(&query_with_signature));

        Ok(url.to_string())
    }
}

fn sanitize_prefix(prefix: &str) -> String {
    prefix
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn derive_signing_key(secret: &str, date: &str, region: &str, service: &str) -> Vec<u8> {
    let mut key = format!("AWS4{}", secret).into_bytes();
    key = hmac_sign(&key, date);
    key = hmac_sign(&key, region);
    key = hmac_sign(&key, service);
    hmac_sign(&key, b"aws4_request")
}

fn hmac_sign(key: &[u8], message: impl AsRef<[u8]>) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(message.as_ref());
    mac.finalize().into_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[serial_test::serial]
    fn test_https_required_in_prod() {
        // Set APP_ENV=prod to enforce HTTPS requirement
        std::env::set_var("APP_ENV", "prod");

        let settings = ObjectStorageSettings {
            bucket: "test".into(),
            region: "ru-central1".into(),
            endpoint: Some("http://insecure.com".into()),
            access_key: "key".into(),
            secret_key: "secret".into(),
            reports_prefix: "reports".into(),
        };

        let result = ObjectStorageClient::new(settings);
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("HTTPS"));
        assert!(err_msg.contains("production"));

        // Clean up
        std::env::remove_var("APP_ENV");
    }

    #[test]
    #[serial_test::serial]
    fn test_http_allowed_in_dev() {
        // Set APP_ENV=dev to allow HTTP endpoints
        std::env::set_var("APP_ENV", "dev");

        let settings = ObjectStorageSettings {
            bucket: "test".into(),
            region: "ru-central1".into(),
            endpoint: Some("http://localhost:9000".into()),
            access_key: "minioadmin".into(),
            secret_key: "minioadmin".into(),
            reports_prefix: "reports/dev".into(),
        };

        let result = ObjectStorageClient::new(settings);
        assert!(result.is_ok());

        // Clean up
        std::env::remove_var("APP_ENV");
    }

    #[test]
    fn test_https_always_works() {
        let settings = ObjectStorageSettings {
            bucket: "test".into(),
            region: "ru-central1".into(),
            endpoint: Some("https://storage.yandexcloud.net".into()),
            access_key: "key".into(),
            secret_key: "secret".into(),
            reports_prefix: "reports".into(),
        };

        let result = ObjectStorageClient::new(settings);
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_scheme_rejected() {
        let settings = ObjectStorageSettings {
            bucket: "test".into(),
            region: "ru-central1".into(),
            endpoint: Some("ftp://example.com".into()),
            access_key: "key".into(),
            secret_key: "secret".into(),
            reports_prefix: "reports".into(),
        };

        let result = ObjectStorageClient::new(settings);
        assert!(result.is_err());
    }
}
