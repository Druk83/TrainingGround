use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub mongo_uri: String,
    pub redis_uri: String,
    pub mongo_database: String,
    pub jwt_secret: String,
    pub python_api_url: String,
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

        Ok(Config {
            mongo_uri,
            redis_uri,
            mongo_database,
            jwt_secret,
            python_api_url,
        })
    }
}
