use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use mongodb::{
    bson::{doc, from_document, to_document},
    Database,
};

use crate::models::system_settings::{
    AnticheatSettings, EmailSettings, SsoSettings, SystemSetting, SystemSettingsResponse,
    YandexGptSettings,
};

const KEY_YANDEXGPT: &str = "yandexgpt";
const KEY_SSO: &str = "sso";
const KEY_EMAIL: &str = "email";
const KEY_ANTICHEAT: &str = "anticheat";

pub struct SystemSettingsService {
    mongo: Database,
}

impl SystemSettingsService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    pub async fn get_email_settings(&self) -> Result<Option<EmailSettings>> {
        let collection = self.mongo.collection::<SystemSetting>("system_settings");
        if let Some(setting) = collection
            .find_one(doc! { "key": KEY_EMAIL })
            .await
            .context("Failed to query email settings")?
        {
            let parsed = from_document(setting.value)
                .map_err(|e| anyhow!("Failed to parse email settings: {e}"))?;
            Ok(Some(parsed))
        } else {
            Ok(None)
        }
    }

    pub async fn get_all(&self) -> Result<SystemSettingsResponse> {
        let collection = self.mongo.collection::<SystemSetting>("system_settings");
        let mut cursor = collection
            .find(doc! { "key": { "$in": [KEY_YANDEXGPT, KEY_SSO, KEY_EMAIL, KEY_ANTICHEAT] } })
            .await
            .context("Failed to query system settings")?;

        let mut response = SystemSettingsResponse::default();
        while cursor
            .advance()
            .await
            .context("Failed to advance system settings cursor")?
        {
            let setting = cursor
                .deserialize_current()
                .context("Failed to deserialize system setting")?;
            match setting.key.as_str() {
                KEY_YANDEXGPT => {
                    response.yandexgpt = from_document(setting.value)
                        .map_err(|e| anyhow!("Failed to parse yandexgpt settings: {e}"))?;
                }
                KEY_SSO => {
                    response.sso = from_document(setting.value)
                        .map_err(|e| anyhow!("Failed to parse sso settings: {e}"))?;
                }
                KEY_EMAIL => {
                    response.email = from_document(setting.value)
                        .map_err(|e| anyhow!("Failed to parse email settings: {e}"))?;
                }
                KEY_ANTICHEAT => {
                    response.anticheat = from_document(setting.value)
                        .map_err(|e| anyhow!("Failed to parse anticheat settings: {e}"))?;
                }
                _ => continue,
            }
        }

        Ok(response)
    }

    pub async fn update_yandexgpt(
        &self,
        settings: YandexGptSettings,
        updated_by: &str,
    ) -> Result<YandexGptSettings> {
        self.upsert(KEY_YANDEXGPT, "yandexgpt", &settings, updated_by)
            .await?;
        Ok(settings)
    }

    pub async fn update_sso(&self, settings: SsoSettings, updated_by: &str) -> Result<SsoSettings> {
        self.upsert(KEY_SSO, "sso", &settings, updated_by).await?;
        Ok(settings)
    }

    pub async fn update_email(
        &self,
        settings: EmailSettings,
        updated_by: &str,
    ) -> Result<EmailSettings> {
        self.upsert(KEY_EMAIL, "email", &settings, updated_by)
            .await?;
        Ok(settings)
    }

    pub async fn update_anticheat(
        &self,
        settings: AnticheatSettings,
        updated_by: &str,
    ) -> Result<AnticheatSettings> {
        self.upsert(KEY_ANTICHEAT, "anticheat", &settings, updated_by)
            .await?;
        Ok(settings)
    }

    async fn upsert<T: serde::Serialize>(
        &self,
        key: &str,
        category: &str,
        value: &T,
        updated_by: &str,
    ) -> Result<()> {
        let collection = self.mongo.collection::<SystemSetting>("system_settings");
        let value_doc = to_document(value).context("Failed to serialize settings value")?;
        let now = mongodb::bson::DateTime::from_millis(Utc::now().timestamp_millis());

        collection
            .update_one(
                doc! { "key": key },
                doc! {
                    "$set": {
                        "key": key,
                        "category": category,
                        "value": value_doc,
                        "updatedBy": updated_by,
                        "updatedAt": now,
                    }
                },
            )
            .upsert(true)
            .await
            .context("Failed to upsert system setting")?;

        Ok(())
    }
}
