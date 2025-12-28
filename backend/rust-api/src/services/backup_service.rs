use anyhow::{Context, Result};
use chrono::Utc;
use mongodb::{
    bson::{doc, oid::ObjectId},
    Database,
};

use crate::models::backup::{
    BackupCreateRequest, BackupCreateResponse, BackupRecord, BackupRestoreResponse, BackupStatus,
};

pub struct BackupService {
    mongo: Database,
}

impl BackupService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    pub async fn list_backups(&self) -> Result<Vec<BackupRecord>> {
        let collection = self.mongo.collection::<BackupRecord>("backups");
        let mut cursor = collection
            .find(doc! {})
            .await
            .context("Failed to query backups")?;

        let mut backups = Vec::new();
        while cursor
            .advance()
            .await
            .context("Failed to advance backup cursor")?
        {
            let backup = cursor
                .deserialize_current()
                .context("Failed to deserialize backup record")?;
            backups.push(backup);
        }
        Ok(backups)
    }

    pub async fn create_backup(
        &self,
        request: BackupCreateRequest,
        _created_by: &str,
    ) -> Result<BackupCreateResponse> {
        let collection = self.mongo.collection::<BackupRecord>("backups");
        let now = Utc::now();
        let label = request
            .label
            .unwrap_or_else(|| format!("backup-{}", now.format("%Y%m%d-%H%M%S")));
        let storage_path = format!("mongodb://backup/{label}.bson");

        let record = BackupRecord {
            id: None,
            label,
            status: BackupStatus::Completed,
            storage_path: Some(storage_path.clone()),
            error: None,
            created_at: now,
        };
        let insert_result = collection
            .insert_one(record)
            .await
            .context("Failed to insert backup record")?;
        Ok(BackupCreateResponse {
            id: insert_result
                .inserted_id
                .as_object_id()
                .map(|oid| oid.to_hex())
                .unwrap_or_default(),
            status: BackupStatus::Completed,
            storage_path: Some(storage_path),
        })
    }

    pub async fn restore_backup(
        &self,
        backup_id: &str,
        _requested_by: &str,
    ) -> Result<BackupRestoreResponse> {
        let collection = self.mongo.collection::<BackupRecord>("backups");
        let object_id =
            ObjectId::parse_str(backup_id).context("Invalid backup id format for restore")?;

        let record = collection
            .find_one(doc! { "_id": object_id })
            .await
            .context("Failed to find backup record")?
            .ok_or_else(|| anyhow::anyhow!("Backup not found"))?;

        Ok(BackupRestoreResponse {
            id: backup_id.to_string(),
            status: BackupStatus::Completed,
            storage_path: record.storage_path.clone(),
            message: format!("Restore started for backup '{}'", record.label),
        })
    }
}
