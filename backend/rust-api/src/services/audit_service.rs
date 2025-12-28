use anyhow::{Context, Result};
use chrono::Utc;
use mongodb::{
    bson::{doc, DateTime as BsonDateTime, Regex},
    Database,
};

use crate::models::audit_log::{AuditEventType, AuditLog, AuditLogQuery};

/// Parameters for audit event logging
#[derive(Debug)]
pub struct AuditEventParams {
    pub event_type: AuditEventType,
    pub user_id: Option<String>,
    pub email: Option<String>,
    pub success: bool,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub details: Option<String>,
    pub error_message: Option<String>,
}

/// Service for audit logging
pub struct AuditService {
    mongo: Database,
}

impl AuditService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    /// Log an audit event
    pub async fn log_event(
        &self,
        params: AuditEventParams,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let audit_log = AuditLog {
            id: None,
            event_type: params.event_type,
            user_id: params.user_id,
            email: params.email,
            success: params.success,
            ip: params.ip,
            user_agent: params.user_agent,
            details: params.details,
            error_message: params.error_message,
            created_at: Utc::now(),
        };

        let collection = self.mongo.collection::<AuditLog>("audit_log");
        collection.insert_one(audit_log).await?;

        Ok(())
    }

    /// Log a successful login
    pub async fn log_login_success(
        &self,
        user_id: &str,
        email: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::Login,
            user_id: Some(user_id.to_string()),
            email: Some(email.to_string()),
            success: true,
            ip,
            user_agent,
            details: None,
            error_message: None,
        })
        .await
    }

    /// Log a failed login attempt
    pub async fn log_login_failed(
        &self,
        email: &str,
        ip: Option<String>,
        user_agent: Option<String>,
        error: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::LoginFailed,
            user_id: None,
            email: Some(email.to_string()),
            success: false,
            ip,
            user_agent,
            details: None,
            error_message: Some(error.to_string()),
        })
        .await
    }

    /// Log a successful registration
    pub async fn log_register_success(
        &self,
        user_id: &str,
        email: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::Register,
            user_id: Some(user_id.to_string()),
            email: Some(email.to_string()),
            success: true,
            ip,
            user_agent,
            details: None,
            error_message: None,
        })
        .await
    }

    /// Log a failed registration
    pub async fn log_register_failed(
        &self,
        email: &str,
        ip: Option<String>,
        user_agent: Option<String>,
        error: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::RegisterFailed,
            user_id: None,
            email: Some(email.to_string()),
            success: false,
            ip,
            user_agent,
            details: None,
            error_message: Some(error.to_string()),
        })
        .await
    }

    /// Log a logout
    pub async fn log_logout(
        &self,
        user_id: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::Logout,
            user_id: Some(user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: None,
            error_message: None,
        })
        .await
    }

    /// Log a password change
    pub async fn log_password_change(
        &self,
        user_id: &str,
        success: bool,
        ip: Option<String>,
        user_agent: Option<String>,
        error_message: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let event_type = if success {
            AuditEventType::ChangePassword
        } else {
            AuditEventType::ChangePasswordFailed
        };

        self.log_event(AuditEventParams {
            event_type,
            user_id: Some(user_id.to_string()),
            email: None,
            success,
            ip,
            user_agent,
            details: None,
            error_message,
        })
        .await
    }

    /// Log a token refresh
    pub async fn log_token_refresh(
        &self,
        user_id: Option<&str>,
        success: bool,
        ip: Option<String>,
        user_agent: Option<String>,
        error_message: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let event_type = if success {
            AuditEventType::RefreshToken
        } else {
            AuditEventType::RefreshTokenFailed
        };

        self.log_event(AuditEventParams {
            event_type,
            user_id: user_id.map(|s| s.to_string()),
            email: None,
            success,
            ip,
            user_agent,
            details: None,
            error_message,
        })
        .await
    }

    /// Log session revocation
    pub async fn log_session_revoke(
        &self,
        user_id: &str,
        count: u64,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::RevokeSession,
            user_id: Some(user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!("Revoked {} sessions", count)),
            error_message: None,
        })
        .await
    }

    /// Log user update (admin action)
    pub async fn log_user_update(
        &self,
        admin_user_id: &str,
        target_user_id: &str,
        changes: String,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::UpdateUser,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!("Updated user {}: {}", target_user_id, changes)),
            error_message: None,
        })
        .await
    }

    /// Log access denied event
    pub async fn log_access_denied(
        &self,
        user_id: Option<&str>,
        resource: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::AccessDenied,
            user_id: user_id.map(|s| s.to_string()),
            email: None,
            success: false,
            ip,
            user_agent,
            details: Some(format!("Access denied to: {}", resource)),
            error_message: None,
        })
        .await
    }

    /// Log user creation (admin action)
    pub async fn log_user_create(
        &self,
        admin_user_id: &str,
        created_user_id: &str,
        email: &str,
        role: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::CreateUser,
            user_id: Some(admin_user_id.to_string()),
            email: Some(email.to_string()),
            success: true,
            ip,
            user_agent,
            details: Some(format!(
                "Created user {} with role {}",
                created_user_id, role
            )),
            error_message: None,
        })
        .await
    }

    /// Log user deletion (admin action)
    pub async fn log_user_delete(
        &self,
        admin_user_id: &str,
        deleted_user_id: &str,
        email: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::DeleteUser,
            user_id: Some(admin_user_id.to_string()),
            email: Some(email.to_string()),
            success: true,
            ip,
            user_agent,
            details: Some(format!("Deleted user {}", deleted_user_id)),
            error_message: None,
        })
        .await
    }

    /// Log user blocking (admin action)
    pub async fn log_user_block(
        &self,
        admin_user_id: &str,
        blocked_user_id: &str,
        reason: &str,
        duration_hours: Option<u32>,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let duration_text = if let Some(hours) = duration_hours {
            format!("{} hours", hours)
        } else {
            "permanent".to_string()
        };

        self.log_event(AuditEventParams {
            event_type: AuditEventType::BlockUser,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!(
                "Blocked user {} for {} - reason: {}",
                blocked_user_id, duration_text, reason
            )),
            error_message: None,
        })
        .await
    }

    /// Log user unblocking (admin action)
    pub async fn log_user_unblock(
        &self,
        admin_user_id: &str,
        unblocked_user_id: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::UnblockUser,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!("Unblocked user {}", unblocked_user_id)),
            error_message: None,
        })
        .await
    }

    /// Log group creation (admin action)
    pub async fn log_group_create(
        &self,
        admin_user_id: &str,
        group_id: &str,
        group_name: &str,
        school: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::CreateGroup,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!(
                "Created group {} '{}' for school '{}'",
                group_id, group_name, school
            )),
            error_message: None,
        })
        .await
    }

    /// Log group update (admin action)
    pub async fn log_group_update(
        &self,
        admin_user_id: &str,
        group_id: &str,
        changes: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::UpdateGroup,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!("Updated group {}: {}", group_id, changes)),
            error_message: None,
        })
        .await
    }

    /// Log group deletion (admin action)
    pub async fn log_group_delete(
        &self,
        admin_user_id: &str,
        group_id: &str,
        group_name: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.log_event(AuditEventParams {
            event_type: AuditEventType::DeleteGroup,
            user_id: Some(admin_user_id.to_string()),
            email: None,
            success: true,
            ip,
            user_agent,
            details: Some(format!("Deleted group {} '{}'", group_id, group_name)),
            error_message: None,
        })
        .await
    }

    pub async fn list_logs(&self, query: AuditLogQuery) -> Result<Vec<AuditLog>> {
        self.fetch_logs(query, None).await
    }

    pub async fn export_logs(&self, query: AuditLogQuery, max_limit: u32) -> Result<Vec<AuditLog>> {
        self.fetch_logs(query, Some(max_limit)).await
    }

    async fn fetch_logs(
        &self,
        query: AuditLogQuery,
        override_limit: Option<u32>,
    ) -> Result<Vec<AuditLog>> {
        let collection = self.mongo.collection::<AuditLog>("audit_log");
        let filter = build_filter(&query);

        let limit = override_limit.unwrap_or_else(|| query.limit.unwrap_or(50).min(500)) as i64;
        let skip = query.offset.unwrap_or(0) as u64;

        let mut cursor = collection
            .find(filter)
            .sort(doc! { "createdAt": -1 })
            .skip(skip)
            .limit(limit)
            .await
            .context("Failed to query audit logs")?;

        let mut result = Vec::new();
        while cursor
            .advance()
            .await
            .context("Failed to advance audit log cursor")?
        {
            let log = cursor
                .deserialize_current()
                .context("Failed to deserialize audit log")?;
            result.push(log);
        }

        Ok(result)
    }
}

fn build_filter(query: &AuditLogQuery) -> mongodb::bson::Document {
    let mut filter = doc! {};

    if let Some(event_type) = &query.event_type {
        filter.insert("event_type", event_type.as_str());
    }

    if let Some(user_id) = &query.user_id {
        filter.insert("user_id", user_id);
    }

    if let Some(success) = query.success {
        filter.insert("success", success);
    }

    if query.from.is_some() || query.to.is_some() {
        let mut range = doc! {};
        if let Some(from) = query.from {
            range.insert("$gte", BsonDateTime::from_millis(from.timestamp_millis()));
        }
        if let Some(to) = query.to {
            range.insert("$lte", BsonDateTime::from_millis(to.timestamp_millis()));
        }
        filter.insert("createdAt", range);
    }

    if let Some(search) = &query.search {
        let regex = Regex {
            pattern: search.to_string(),
            options: "i".into(),
        };
        filter.insert(
            "$or",
            vec![
                doc! { "email": &regex },
                doc! { "details": &regex },
                doc! { "error_message": &regex },
            ],
        );
    }

    filter
}
