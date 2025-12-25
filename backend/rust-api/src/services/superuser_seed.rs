use crate::config::Config;
use anyhow::{Context, Result};
use bcrypt::{hash, DEFAULT_COST};
use mongodb::{
    bson::{doc, Document},
    Database,
};
use serde::Deserialize;
use std::path::Path;
use tokio::fs;

#[derive(Debug, Deserialize)]
pub struct SuperuserSeed {
    pub email: String,
    #[serde(default = "default_superuser_name")]
    pub name: String,
    #[serde(default = "default_superuser_role")]
    pub role: String,
    #[serde(default)]
    pub group_ids: Vec<String>,
    #[serde(default)]
    pub metadata: Document,
    /// Plain-text password from seed file (will be hashed before storage)
    pub password: Option<String>,
}

fn default_superuser_name() -> String {
    "Super Admin".to_string()
}

fn default_superuser_role() -> String {
    "admin".to_string()
}

impl SuperuserSeed {
    fn into_document(self) -> Result<Document> {
        let mut doc = doc! {
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "group_ids": self.group_ids,
            "metadata": self.metadata,
            "created_at": bson_now(),
            "updated_at": bson_now(),
        };

        // Hash password if provided (bcrypt with cost 12)
        if let Some(plain_password) = self.password {
            let hashed =
                hash(plain_password, DEFAULT_COST).context("Failed to hash superuser password")?;
            doc.insert("password_hash", hashed);
        }

        Ok(doc)
    }
}

fn bson_now() -> mongodb::bson::DateTime {
    mongodb::bson::DateTime::now()
}

pub async fn bootstrap(config: &Config, mongo: &Database) -> Result<()> {
    tracing::debug!(
        "Checking for superuser seed file config: {:?}",
        config.superuser_seed_file
    );

    let path = match &config.superuser_seed_file {
        Some(path) if !path.is_empty() => {
            tracing::info!("Found superuser seed file path: {}", path);
            Path::new(path)
        }
        _ => {
            tracing::debug!("No superuser seed file configured, skipping bootstrap");
            return Ok(());
        }
    };

    if !path.exists() {
        tracing::warn!(
            "Superuser seed file {} not found, skipping bootstrap",
            path.display()
        );
        return Ok(());
    }

    tracing::info!("Superuser seed file found at {}", path.display());

    let contents = fs::read_to_string(path)
        .await
        .context("Failed to read superuser seed file")?;

    let seed: SuperuserSeed =
        serde_json::from_str(&contents).context("Failed to deserialize superuser seed payload")?;

    let email = seed.email.clone();
    let doc = seed.into_document()?;
    let collection = mongo.collection::<Document>("users");
    tracing::info!("Bootstrapping superuser with email {}", email);

    let update = collection
        .update_one(doc! { "email": &email }, doc! { "$setOnInsert": doc })
        .upsert(true)
        .await
        .context("Failed to insert superuser")?;

    if update.upserted_id.is_some() {
        tracing::info!("Superuser inserted; remove seed file to prevent rerun");
    } else {
        tracing::info!("Superuser already exists, seed skipped");
    }

    Ok(())
}
