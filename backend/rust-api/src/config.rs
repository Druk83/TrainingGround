use serde::Deserialize;
use std::{env, time::Duration};

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub mongo_uri: String,
    pub redis_uri: String,
    pub mongo_database: String,
    pub jwt_secret: String,
    pub python_api_url: String,
    pub reporting: ReportingSettings,
    pub content: ContentSettings,
    pub cookie: CookieSettings,
    pub superuser_seed_file: Option<String>,
    pub object_storage: Option<ObjectStorageSettings>,
    pub enable_sso: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReportingSettings {
    #[serde(default = "ReportingSettings::default_signed_url_ttl_hours")]
    pub signed_url_ttl_hours: u64,
    #[serde(default = "ReportingSettings::default_export_ttl_hours")]
    pub export_ttl_hours: u64,
    #[serde(default = "ReportingSettings::default_export_rate_limit")]
    pub export_rate_limit_per_hour: u32,
    #[serde(default = "ReportingSettings::default_polling_interval")]
    pub live_polling_interval_secs: u64,
    #[serde(default = "ReportingSettings::default_worker_interval_secs")]
    pub worker_interval_secs: u64,
    #[serde(default)]
    pub enable_live_updates: bool,
    #[serde(default = "ReportingSettings::default_export_worker_interval_secs")]
    pub export_worker_interval_secs: u64,
}

impl ReportingSettings {
    const fn default_signed_url_ttl_hours() -> u64 {
        24
    }

    const fn default_export_ttl_hours() -> u64 {
        24
    }

    const fn default_export_rate_limit() -> u32 {
        5
    }

    const fn default_polling_interval() -> u64 {
        30
    }

    const fn default_worker_interval_secs() -> u64 {
        3600
    }

    const fn default_export_worker_interval_secs() -> u64 {
        60
    }

    pub fn from_env() -> Self {
        let signed_url_ttl_hours = env::var("REPORTING_SIGNED_URL_TTL_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_signed_url_ttl_hours());
        let export_ttl_hours = env::var("REPORTING_EXPORT_TTL_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_export_ttl_hours());
        let export_rate_limit_per_hour = env::var("REPORTING_EXPORT_RATE_LIMIT_PER_HOUR")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_export_rate_limit());
        let live_polling_interval_secs = env::var("REPORTING_LIVE_POLLING_INTERVAL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_polling_interval());
        let worker_interval_secs = env::var("REPORTING_WORKER_INTERVAL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_worker_interval_secs());
        let export_worker_interval_secs = env::var("REPORTING_EXPORT_WORKER_INTERVAL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(Self::default_export_worker_interval_secs());

        Self {
            signed_url_ttl_hours,
            export_ttl_hours,
            export_rate_limit_per_hour,
            live_polling_interval_secs,
            worker_interval_secs,
            export_worker_interval_secs,
            enable_live_updates: parse_bool_env_var("REPORTING_ENABLE_LIVE_UPDATES")
                .unwrap_or(false),
        }
    }

    pub fn signed_url_ttl(&self) -> Duration {
        Duration::from_secs(self.signed_url_ttl_hours * 3600)
    }

    pub fn export_expiration(&self) -> Duration {
        Duration::from_secs(self.export_ttl_hours * 3600)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContentSettings {
    #[serde(default = "ContentSettings::default_stream_name_string")]
    pub stream_name: String,
}

impl ContentSettings {
    const fn default_stream_name() -> &'static str {
        "content:changes"
    }

    fn default_stream_name_string() -> String {
        Self::default_stream_name().to_string()
    }

    pub fn from_env() -> Self {
        let stream_name = std::env::var("CONTENT_STREAM_NAME")
            .unwrap_or_else(|_| Self::default_stream_name().to_string());
        Self { stream_name }
    }
}

impl Default for ContentSettings {
    fn default() -> Self {
        Self {
            stream_name: Self::default_stream_name().to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CookieSettings {
    #[serde(default = "CookieSettings::default_secure")]
    pub secure: bool,
    #[serde(default = "CookieSettings::default_same_site")]
    pub same_site: String,
}

impl CookieSettings {
    const fn default_secure() -> bool {
        true
    }

    fn default_same_site() -> String {
        "Strict".to_string()
    }

    pub fn from_env() -> Self {
        let secure = parse_bool_env_var("COOKIE_SECURE").unwrap_or(Self::default_secure());
        let same_site = env::var("COOKIE_SAME_SITE").unwrap_or_else(|_| Self::default_same_site());
        Self { secure, same_site }
    }

    pub fn parse_same_site(&self) -> axum_extra::extract::cookie::SameSite {
        match self.same_site.to_lowercase().as_str() {
            "strict" => axum_extra::extract::cookie::SameSite::Strict,
            "lax" => axum_extra::extract::cookie::SameSite::Lax,
            "none" => axum_extra::extract::cookie::SameSite::None,
            _ => {
                tracing::warn!(
                    "Invalid COOKIE_SAME_SITE value: {}, defaulting to Strict",
                    self.same_site
                );
                axum_extra::extract::cookie::SameSite::Strict
            }
        }
    }
}

impl Default for CookieSettings {
    fn default() -> Self {
        Self {
            secure: Self::default_secure(),
            same_site: Self::default_same_site(),
        }
    }
}

impl Default for ReportingSettings {
    fn default() -> Self {
        Self {
            signed_url_ttl_hours: Self::default_signed_url_ttl_hours(),
            export_ttl_hours: Self::default_export_ttl_hours(),
            export_rate_limit_per_hour: Self::default_export_rate_limit(),
            live_polling_interval_secs: Self::default_polling_interval(),
            worker_interval_secs: Self::default_worker_interval_secs(),
            export_worker_interval_secs: Self::default_export_worker_interval_secs(),
            enable_live_updates: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ObjectStorageSettings {
    pub bucket: String,
    pub region: String,
    #[serde(default)]
    pub endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,
    #[serde(default = "ObjectStorageSettings::default_reports_prefix")]
    pub reports_prefix: String,
}

impl ObjectStorageSettings {
    fn default_reports_prefix() -> String {
        "reports".to_string()
    }

    pub fn from_env() -> Option<Self> {
        let bucket = env::var("OBJECT_STORAGE_BUCKET").ok()?;
        let access_key = env::var("OBJECT_STORAGE_ACCESS_KEY").ok()?;
        let secret_key = env::var("OBJECT_STORAGE_SECRET_KEY").ok()?;
        let region =
            env::var("OBJECT_STORAGE_REGION").unwrap_or_else(|_| "ru-central1".to_string());
        let endpoint = env::var("OBJECT_STORAGE_ENDPOINT").ok();
        let reports_prefix = env::var("OBJECT_STORAGE_REPORTS_PREFIX")
            .unwrap_or_else(|_| Self::default_reports_prefix());

        Some(Self {
            bucket,
            region,
            endpoint,
            access_key,
            secret_key,
            reports_prefix,
        })
    }
}

impl Config {
    pub fn load() -> Result<Self, config::ConfigError> {
        // Load environment variables from root .env file (two levels up)
        // Try root .env first, then fallback to local .env
        let skip_root_env = env::var("SKIP_ROOT_ENV").is_ok();
        if skip_root_env {
            dotenvy::dotenv().ok();
        } else if dotenvy::from_path("../../.env").is_err() {
            // Fallback to current directory .env for backward compatibility
            dotenvy::dotenv().ok();
        }

        // Determine environment (defaults to dev)
        let env = env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string());

        // Build configuration from config/*.toml + ENV overrides
        let config_builder = config::Config::builder()
            // Load base config from TOML file
            .add_source(
                config::File::with_name(&format!("config/{}", env)).required(false), // Allow missing config file, fallback to ENV
            )
            // Override with environment variables (prefix: APP_)
            .add_source(config::Environment::with_prefix("APP").separator("__"));

        let settings = config_builder.build()?;

        // Extract values with fallbacks to ENV or defaults
        let mongo_uri = settings
            .get_string("database.mongo_uri")
            .or_else(|_| env::var("MONGO_URI"))
            .unwrap_or_else(|_| {
                let user = env::var("MONGO_USER").expect("MONGO_USER must be set");
                let password = env::var("MONGO_PASSWORD").expect("MONGO_PASSWORD must be set");
                let db = env::var("MONGO_DB").unwrap_or_else(|_| "trainingground".to_string());
                eprintln!("WARNING: Building MongoDB URI from MONGO_USER/MONGO_PASSWORD env vars");
                format!(
                    "mongodb://{}:{}@localhost:27017/{}?authSource=admin",
                    user, password, db
                )
            });

        let redis_uri = settings
            .get_string("redis.uri")
            .or_else(|_| env::var("REDIS_URI"))
            .unwrap_or_else(|_| {
                let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
                let port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
                let password = env::var("REDIS_PASSWORD").expect("REDIS_PASSWORD must be set");
                eprintln!("WARNING: Building Redis URI from REDIS_PASSWORD env var");
                format!("redis://:{}@{}:{}/0", password, host, port)
            });

        let mongo_database = settings
            .get_string("database.mongo_database")
            .or_else(|_| env::var("MONGO_DATABASE"))
            .unwrap_or_else(|_| "trainingground".to_string());

        let jwt_secret = settings
            .get_string("auth.jwt_secret")
            .or_else(|_| env::var("JWT_SECRET"))
            .unwrap_or_else(|_| {
                if env == "prod" {
                    panic!("FATAL: JWT_SECRET must be set in production!");
                }
                eprintln!("WARNING: Using default JWT_SECRET (dev mode only!)");
                "dev-secret-only-for-local-testing".to_string()
            });

        let python_api_url = settings
            .get_string("python_api.url")
            .or_else(|_| env::var("PYTHON_API_URL"))
            .unwrap_or_else(|_| "http://localhost:8000".to_string());

        let reporting = settings
            .get::<ReportingSettings>("reporting")
            .unwrap_or_else(|_| ReportingSettings::from_env());

        let object_storage = match settings.get::<ObjectStorageSettings>("object_storage") {
            Ok(cfg) => Some(cfg),
            Err(_) => ObjectStorageSettings::from_env(),
        };

        let content = settings
            .get::<ContentSettings>("content")
            .unwrap_or_else(|_| ContentSettings::from_env());

        let cookie = settings
            .get::<CookieSettings>("cookie")
            .unwrap_or_else(|_| CookieSettings::from_env());

        let superuser_seed_file = settings
            .get_string("superuser_seed_file")
            .ok()
            .or_else(|| env::var("ADMIN_SEED_FILE").ok());

        let enable_sso = settings
            .get_bool("sso.enabled")
            .map(Some)
            .unwrap_or_else(|_| parse_bool_env_var("ENABLE_SSO"))
            .unwrap_or(false);

        Ok(Config {
            mongo_uri,
            redis_uri,
            mongo_database,
            jwt_secret,
            python_api_url,
            reporting,
            content,
            cookie,
            superuser_seed_file,
            object_storage,
            enable_sso,
        })
    }
}

fn parse_bool_env_var(key: &str) -> Option<bool> {
    env::var(key).ok().map(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}
