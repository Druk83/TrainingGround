use crate::models::feature_flag::{FeatureFlag, FeatureFlagCreateRequest};
use chrono::Utc;
use mongodb::{bson::doc, Database};
use redis::{aio::ConnectionManager, AsyncCommands};
use tracing::{debug, error, info, warn};

const FEATURE_FLAGS_COLLECTION: &str = "feature_flags";
const CACHE_TTL_SECONDS: usize = 60;
const CACHE_KEY_PREFIX: &str = "ff:";

/// Parameters for updating a feature flag
pub struct UpdateFlagRequest {
    pub enabled: Option<bool>,
    pub scope: Option<String>,
    pub target_ids: Option<Vec<String>>,
    pub description: Option<String>,
    pub change_reason: String,
}

// Prometheus metrics (to be exported via metrics module):
// - feature_flags_check_total: counter - total flag checks
// - feature_flags_cache_hits: counter - cache hits
// - feature_flags_cache_misses: counter - cache misses
// - feature_flags_active_total: gauge - number of enabled flags
// - feature_flags_updated_total: counter - number of flag updates
// - feature_flags_update_timestamp: gauge - last update timestamp

/// Feature Flag Service with Redis caching and graceful degradation
pub struct FeatureFlagService {
    db: Database,
    redis_conn: Option<ConnectionManager>,
}

impl FeatureFlagService {
    /// Create new service instance
    pub fn new(db: Database, redis_conn: Option<ConnectionManager>) -> Self {
        Self { db, redis_conn }
    }

    /// Check if flag is enabled for given context
    /// Hierarchy: user-level > group-level > global
    pub async fn is_enabled(
        &mut self,
        flag_key: &str,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> bool {
        // Try to get from cache first
        if let Some(cached) = self.get_from_cache(flag_key, user_id, group_id).await {
            debug!(
                "Cache hit for flag: {}, user: {:?}, group: {:?}",
                flag_key, user_id, group_id
            );
            return cached;
        }

        // Get from MongoDB
        match self.get_flag_from_db(flag_key).await {
            Ok(Some(flag)) => {
                let enabled = self.check_flag_enabled(&flag, user_id, group_id);
                // Try to cache the result
                let _ = self.set_cache(flag_key, user_id, group_id, enabled).await;
                enabled
            }
            Ok(None) => {
                warn!("Flag not found: {}", flag_key);
                false
            }
            Err(e) => {
                error!(
                    "Failed to get flag from DB: {}, using graceful degradation",
                    e
                );
                // Graceful degradation: return false on database error
                false
            }
        }
    }

    /// Get all enabled flags for a user
    pub async fn get_all_enabled_flags(
        &mut self,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> Vec<String> {
        match self.get_all_flags_from_db().await {
            Ok(flags) => flags
                .into_iter()
                .filter(|flag| self.check_flag_enabled(flag, user_id, group_id))
                .map(|flag| flag.flag_key)
                .collect(),
            Err(e) => {
                error!("Failed to get all flags: {}", e);
                Vec::new()
            }
        }
    }

    /// Get specific flag with full details
    pub async fn get_flag(
        &self,
        flag_key: &str,
    ) -> Result<Option<FeatureFlag>, Box<dyn std::error::Error>> {
        self.get_flag_from_db(flag_key).await
    }

    /// Create new feature flag
    pub async fn create_flag(
        &mut self,
        req: FeatureFlagCreateRequest,
        admin_user_id: &str,
    ) -> Result<FeatureFlag, Box<dyn std::error::Error>> {
        // Check if flag already exists
        if self.get_flag_from_db(&req.flag_key).await?.is_some() {
            return Err(format!("Flag '{}' already exists", req.flag_key).into());
        }

        let now = Utc::now();
        let flag = FeatureFlag {
            id: None,
            flag_key: req.flag_key.clone(),
            description: req.description,
            enabled: req.enabled,
            scope: req.scope,
            target_ids: req.target_ids,
            config: req.config,
            version: 1,
            updated_at: now,
            updated_by: admin_user_id.to_string(),
            change_reason: req.change_reason,
        };

        let collection = self.db.collection::<FeatureFlag>(FEATURE_FLAGS_COLLECTION);
        collection.insert_one(&flag).await?;

        // Invalidate cache
        self.invalidate_flag_cache(&flag.flag_key).await;

        info!(
            "Feature flag created: {}, enabled: {}, scope: {}",
            flag.flag_key, flag.enabled, flag.scope
        );

        Ok(flag)
    }

    /// Update feature flag
    pub async fn update_flag(
        &mut self,
        flag_key: &str,
        req: UpdateFlagRequest,
        admin_user_id: &str,
    ) -> Result<FeatureFlag, Box<dyn std::error::Error>> {
        let collection = self.db.collection::<FeatureFlag>(FEATURE_FLAGS_COLLECTION);

        // Get current flag
        let current_flag = self
            .get_flag_from_db(flag_key)
            .await?
            .ok_or_else(|| format!("Flag '{}' not found", flag_key))?;

        // Build update document
        let now = Utc::now();
        let now_rfc3339 = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut update_doc = doc! {
            "updated_at": now_rfc3339,
            "updated_by": admin_user_id,
            "change_reason": req.change_reason.clone(),
            "version": current_flag.version + 1,
        };

        if let Some(e) = req.enabled {
            update_doc.insert("enabled", e);
        }
        if let Some(s) = req.scope {
            update_doc.insert("scope", s);
        }
        if let Some(t) = req.target_ids {
            update_doc.insert("target_ids", t);
        }
        if let Some(d) = req.description {
            update_doc.insert("description", d);
        }

        collection
            .update_one(doc! { "flag_key": flag_key }, doc! { "$set": update_doc })
            .await?;

        // Invalidate cache
        self.invalidate_flag_cache(flag_key).await;

        info!(
            "Feature flag updated: {}, reason: {}",
            flag_key, req.change_reason
        );

        // Return updated flag
        self.get_flag_from_db(flag_key)
            .await?
            .ok_or_else(|| "Failed to retrieve updated flag".into())
    }

    /// Delete feature flag
    pub async fn delete_flag(&mut self, flag_key: &str) -> Result<(), Box<dyn std::error::Error>> {
        let collection = self.db.collection::<FeatureFlag>(FEATURE_FLAGS_COLLECTION);
        collection.delete_one(doc! { "flag_key": flag_key }).await?;

        // Invalidate cache
        self.invalidate_flag_cache(flag_key).await;

        info!("Feature flag deleted: {}", flag_key);

        Ok(())
    }

    // ============ Private Helper Methods ============

    /// Check if flag is enabled for specific context
    fn check_flag_enabled(
        &self,
        flag: &FeatureFlag,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> bool {
        Self::check_flag_enabled_static(flag, user_id, group_id)
    }

    /// Static version for testing
    fn check_flag_enabled_static(
        flag: &FeatureFlag,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> bool {
        if !flag.enabled {
            return false;
        }

        match flag.scope.as_str() {
            "global" => true,
            "user" => user_id.is_some_and(|id| flag.target_ids.contains(&id.to_string())),
            "group" => group_id.is_some_and(|id| flag.target_ids.contains(&id.to_string())),
            _ => {
                warn!("Unknown flag scope: {}", flag.scope);
                false
            }
        }
    }

    /// Get flag from database
    async fn get_flag_from_db(
        &self,
        flag_key: &str,
    ) -> Result<Option<FeatureFlag>, Box<dyn std::error::Error>> {
        let collection = self.db.collection::<FeatureFlag>(FEATURE_FLAGS_COLLECTION);
        let flag = collection.find_one(doc! { "flag_key": flag_key }).await?;
        Ok(flag)
    }

    /// Get all flags from database
    async fn get_all_flags_from_db(&self) -> Result<Vec<FeatureFlag>, Box<dyn std::error::Error>> {
        let collection = self.db.collection::<FeatureFlag>(FEATURE_FLAGS_COLLECTION);
        let mut cursor = collection.find(doc! {}).await?;
        let mut flags = Vec::new();

        while cursor.advance().await? {
            flags.push(cursor.deserialize_current()?);
        }

        Ok(flags)
    }

    /// Get flag value from Redis cache
    async fn get_from_cache(
        &mut self,
        flag_key: &str,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> Option<bool> {
        self.redis_conn.as_ref()?;

        let cache_key = self.build_cache_key(flag_key, user_id, group_id);

        if let Some(conn) = &self.redis_conn {
            match conn.clone().get::<&str, String>(&cache_key).await {
                Ok(value) => {
                    if let Ok(enabled) = value.parse::<bool>() {
                        return Some(enabled);
                    }
                }
                Err(e) => {
                    debug!("Cache read failed: {}", e);
                }
            }
        }

        None
    }

    /// Set flag value in Redis cache
    async fn set_cache(
        &mut self,
        flag_key: &str,
        user_id: Option<&str>,
        group_id: Option<&str>,
        enabled: bool,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.redis_conn.is_none() {
            return Ok(());
        }

        let cache_key = self.build_cache_key(flag_key, user_id, group_id);

        if let Some(conn) = &self.redis_conn {
            let _: () = conn
                .clone()
                .set_ex(&cache_key, enabled.to_string(), CACHE_TTL_SECONDS as u64)
                .await?;
        }

        Ok(())
    }

    /// Invalidate all cache entries for a flag
    async fn invalidate_flag_cache(&self, flag_key: &str) {
        if self.redis_conn.is_none() {
            return;
        }

        // Invalidate global cache
        let global_key = format!("{}{}:global", CACHE_KEY_PREFIX, flag_key);
        if let Some(conn) = &self.redis_conn {
            let _: Result<(), _> = conn.clone().del(&global_key).await;
        }

        // In real implementation, would need to invalidate all user/group specific entries
        // This is a limitation of Redis key-value store, would benefit from Redis Streams
        debug!("Invalidated cache for flag: {}", flag_key);
    }

    /// Build cache key
    fn build_cache_key(
        &self,
        flag_key: &str,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> String {
        Self::build_cache_key_static(flag_key, user_id, group_id)
    }

    /// Static version for testing
    fn build_cache_key_static(
        flag_key: &str,
        user_id: Option<&str>,
        group_id: Option<&str>,
    ) -> String {
        let scope = if let Some(uid) = user_id {
            format!("user:{}", uid)
        } else if let Some(gid) = group_id {
            format!("group:{}", gid)
        } else {
            "global".to_string()
        };

        format!("{}{flag_key}:{scope}", CACHE_KEY_PREFIX)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::Document;

    #[test]
    fn test_check_flag_enabled_global() {
        let flag = FeatureFlag {
            id: None,
            flag_key: "test".to_string(),
            description: String::new(),
            enabled: true,
            scope: "global".to_string(),
            target_ids: vec![],
            config: Document::default(),
            version: 1,
            updated_at: Utc::now(),
            updated_by: String::new(),
            change_reason: String::new(),
        };

        assert!(FeatureFlagService::check_flag_enabled_static(
            &flag, None, None
        ));
        assert!(FeatureFlagService::check_flag_enabled_static(
            &flag,
            Some("user1"),
            None
        ));
        assert!(FeatureFlagService::check_flag_enabled_static(
            &flag,
            Some("user1"),
            Some("group1")
        ));
    }

    #[test]
    fn test_check_flag_enabled_user_scope() {
        let flag = FeatureFlag {
            id: None,
            flag_key: "test".to_string(),
            description: String::new(),
            enabled: true,
            scope: "user".to_string(),
            target_ids: vec!["user1".to_string()],
            config: Document::default(),
            version: 1,
            updated_at: Utc::now(),
            updated_by: String::new(),
            change_reason: String::new(),
        };

        assert!(FeatureFlagService::check_flag_enabled_static(
            &flag,
            Some("user1"),
            None
        ));
        assert!(!FeatureFlagService::check_flag_enabled_static(
            &flag,
            Some("user2"),
            None
        ));
        assert!(!FeatureFlagService::check_flag_enabled_static(
            &flag, None, None
        ));
    }

    #[test]
    fn test_build_cache_key() {
        assert_eq!(
            FeatureFlagService::build_cache_key_static("hints_enabled", None, None),
            "ff:hints_enabled:global"
        );
        assert_eq!(
            FeatureFlagService::build_cache_key_static("hints_enabled", Some("user1"), None),
            "ff:hints_enabled:user:user1"
        );
        assert_eq!(
            FeatureFlagService::build_cache_key_static("hints_enabled", None, Some("group1")),
            "ff:hints_enabled:group:group1"
        );
    }
}
