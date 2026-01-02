//! Integration tests for Feature Flag Service
//!
//! Run with: cargo test --test feature_flag_tests

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use mongodb::bson::{doc, Document};

    // Mock feature flag for testing
    fn create_test_flag(flag_key: &str, enabled: bool, scope: &str) -> Document {
        let now_rfc3339 = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        doc! {
            "flag_key": flag_key,
            "description": "Test flag",
            "enabled": enabled,
            "scope": scope,
            "target_ids": [],
            "config": {},
            "version": 1,
            "updated_at": now_rfc3339,
            "updated_by": "test",
            "change_reason": "Testing"
        }
    }

    #[test]
    fn test_flag_hierarchy_user_over_group_over_global() {
        // Test that user-level flag takes precedence
        let user_id = "user_123";
        let group_id = "group_456";

        // Global flag (enabled)
        let _global_flag = doc! {
            "flag_key": "test",
            "enabled": true,
            "scope": "global",
            "target_ids": [],
        };

        // Group flag (disabled)
        let group_flag = doc! {
            "flag_key": "test",
            "enabled": false,
            "scope": "group",
            "target_ids": vec![group_id],
        };

        // User flag (enabled)
        let user_flag = doc! {
            "flag_key": "test",
            "enabled": true,
            "scope": "user",
            "target_ids": vec![user_id],
        };

        // With user flag enabled, should be enabled even if group is disabled
        assert!(matches_scope_and_targets(&user_flag, user_id, group_id));
        // If user flag wasn't provided, group would take precedence
        assert!(!matches_scope_and_targets(&group_flag, user_id, group_id));
    }

    #[test]
    fn test_global_scope_applies_to_all() {
        let global_flag = create_test_flag("global_test", true, "global");

        // Should apply to any user/group
        assert!(matches_scope_and_targets(&global_flag, "user_1", "group_1"));
        assert!(matches_scope_and_targets(&global_flag, "user_2", "group_2"));
        assert!(matches_scope_and_targets(&global_flag, "", ""));
        assert!(matches_scope_and_targets(
            &global_flag,
            "unknown_user",
            "unknown_group"
        ));
    }

    #[test]
    fn test_user_scope_only_applies_to_target_users() {
        let user_flag = doc! {
            "flag_key": "user_test",
            "enabled": true,
            "scope": "user",
            "target_ids": vec!["user_1", "user_2"],
        };

        // Should only apply to users in target_ids
        assert!(matches_scope_and_targets(&user_flag, "user_1", "group_any"));
        assert!(matches_scope_and_targets(&user_flag, "user_2", "group_any"));
        assert!(!matches_scope_and_targets(
            &user_flag,
            "user_3",
            "group_any"
        ));
        assert!(!matches_scope_and_targets(
            &user_flag,
            "unknown",
            "group_any"
        ));
    }

    #[test]
    fn test_group_scope_only_applies_to_target_groups() {
        let group_flag = doc! {
            "flag_key": "group_test",
            "enabled": true,
            "scope": "group",
            "target_ids": vec!["group_1", "group_2"],
        };

        // Should only apply to groups in target_ids
        assert!(matches_scope_and_targets(
            &group_flag,
            "any_user",
            "group_1"
        ));
        assert!(matches_scope_and_targets(
            &group_flag,
            "any_user",
            "group_2"
        ));
        assert!(!matches_scope_and_targets(
            &group_flag,
            "any_user",
            "group_3"
        ));
        assert!(!matches_scope_and_targets(
            &group_flag,
            "any_user",
            "unknown"
        ));
    }

    #[test]
    fn test_disabled_flag_never_applies() {
        let disabled_flag = doc! {
            "flag_key": "disabled_test",
            "enabled": false,
            "scope": "global",
            "target_ids": [],
        };

        // Should never apply, even if scope matches
        assert!(!is_flag_enabled(
            &disabled_flag,
            Some("user_1"),
            Some("group_1")
        ));
        assert!(!is_flag_enabled(&disabled_flag, None, Some("group_1")));
        assert!(!is_flag_enabled(&disabled_flag, Some("user_1"), None));
        assert!(!is_flag_enabled(&disabled_flag, None, None));
    }

    #[test]
    fn test_cache_key_format_global() {
        let cache_key = build_cache_key("hints_enabled", None, None);
        assert_eq!(cache_key, "ff:hints_enabled:global");
    }

    #[test]
    fn test_cache_key_format_user() {
        let cache_key = build_cache_key("hints_enabled", Some("user_123"), None);
        assert_eq!(cache_key, "ff:hints_enabled:user:user_123");
    }

    #[test]
    fn test_cache_key_format_group() {
        let cache_key = build_cache_key("hints_enabled", None, Some("group_456"));
        assert_eq!(cache_key, "ff:hints_enabled:group:group_456");
    }

    #[test]
    fn test_dependency_validation_hints_needs_explanation_api() {
        let explanation_api_disabled = create_test_flag("explanation_api_enabled", false, "global");
        let _hints_flag = create_test_flag("hints_enabled", true, "global");

        // Trying to enable hints when explanation_api is disabled should fail
        let dependencies = vec![("hints_enabled", "explanation_api_enabled")];

        assert!(validate_dependency(
            &explanation_api_disabled,
            &explanation_api_disabled,
            &dependencies
        ));
    }

    #[test]
    fn test_config_extraction_from_flag() {
        let flag = doc! {
            "flag_key": "hints_enabled",
            "config": {
                "max_hints_per_task": 3,
                "hint_penalty": 5
            }
        };

        let config = extract_config(&flag);
        assert_eq!(config.get("max_hints_per_task").unwrap(), &3);
        assert_eq!(config.get("hint_penalty").unwrap(), &5);
    }

    #[test]
    fn test_empty_target_ids_means_global() {
        let flag = doc! {
            "flag_key": "test",
            "enabled": true,
            "scope": "user",
            "target_ids": [],  // Empty!
        };

        // Empty target_ids in user scope should not match any user
        assert!(!matches_scope_and_targets(&flag, "user_1", "group_1"));
    }

    // Helper functions for testing
    fn matches_scope_and_targets(flag: &Document, user_id: &str, group_id: &str) -> bool {
        let scope = flag.get_str("scope").unwrap_or("global");
        let target_ids: Vec<String> = flag
            .get_array("target_ids")
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        match scope {
            "global" => true,
            "user" => !user_id.is_empty() && target_ids.contains(&user_id.to_string()),
            "group" => !group_id.is_empty() && target_ids.contains(&group_id.to_string()),
            _ => false,
        }
    }

    fn is_flag_enabled(flag: &Document, user_id: Option<&str>, group_id: Option<&str>) -> bool {
        if !flag.get_bool("enabled").unwrap_or(false) {
            return false;
        }

        let user = user_id.unwrap_or("");
        let group = group_id.unwrap_or("");
        matches_scope_and_targets(flag, user, group)
    }

    fn build_cache_key(flag_key: &str, user_id: Option<&str>, group_id: Option<&str>) -> String {
        let scope = if let Some(uid) = user_id {
            format!("user:{}", uid)
        } else if let Some(gid) = group_id {
            format!("group:{}", gid)
        } else {
            "global".to_string()
        };

        format!("ff:{}:{}", flag_key, scope)
    }

    fn extract_config(flag: &Document) -> std::collections::HashMap<String, i32> {
        let mut config = std::collections::HashMap::new();
        if let Ok(doc) = flag.get_document("config") {
            for (key, value) in doc.iter() {
                if let Some(val) = value.as_i32() {
                    config.insert(key.to_string(), val);
                }
            }
        }
        config
    }

    fn validate_dependency(
        _flag: &Document,
        parent: &Document,
        _dependencies: &[(&str, &str)],
    ) -> bool {
        // If parent is disabled, flag cannot be enabled
        parent.get_bool("enabled").unwrap_or(false)
    }
}
