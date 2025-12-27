use chrono::Utc;
use mongodb::Database;

use crate::models::audit_log::{AuditEventType, AuditLog};

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
}
