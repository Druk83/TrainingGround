use anyhow::{anyhow, Context, Result};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use mongodb::Database;

use crate::{
    models::system_settings::EmailSettings,
    services::system_settings_service::SystemSettingsService,
};

pub struct EmailService {
    mongo: Database,
}

impl EmailService {
    pub fn new(mongo: Database) -> Self {
        Self { mongo }
    }

    pub fn sending_disabled() -> bool {
        std::env::var("EMAIL_SEND_DISABLED")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }

    pub async fn send_password_reset_email(
        &self,
        recipient_email: &str,
        recipient_name: &str,
        temporary_password: &str,
    ) -> Result<()> {
        let settings = self
            .load_email_settings()
            .await?
            .ok_or_else(|| anyhow!("Email settings are not configured"))?;

        let from_address: Mailbox = format!("{} <{}>", settings.from_name, settings.from_email)
            .parse()
            .context("Invalid from email address")?;
        let to_address: Mailbox = format!("{} <{}>", recipient_name, recipient_email)
            .parse()
            .context("Invalid recipient email address")?;

        let subject = "Сброс пароля TrainingGround";
        let body = format!(
            "Здравствуйте, {}!\n\nВаш пароль был сброшен администратором.\nВременный пароль: {}\n\nПожалуйста, войдите в систему и смените пароль в личном кабинете.\n",
            recipient_name, temporary_password
        );

        let email = Message::builder()
            .from(from_address)
            .to(to_address)
            .subject(subject)
            .body(body)
            .context("Failed to build email message")?;

        let mailer = self.build_mailer(&settings)?;
        mailer
            .send(email)
            .await
            .context("Failed to send password reset email")?;

        Ok(())
    }

    pub async fn send_notification_email(
        &self,
        recipient_email: &str,
        recipient_name: &str,
        subject: &str,
        body: &str,
    ) -> Result<()> {
        let settings = self
            .load_email_settings()
            .await?
            .ok_or_else(|| anyhow!("Email settings are not configured"))?;

        let from_address: Mailbox = format!("{} <{}>", settings.from_name, settings.from_email)
            .parse()
            .context("Invalid from email address")?;
        let to_address: Mailbox = format!("{} <{}>", recipient_name, recipient_email)
            .parse()
            .context("Invalid recipient email address")?;

        let email = Message::builder()
            .from(from_address)
            .to(to_address)
            .subject(subject)
            .body(body.to_string())
            .context("Failed to build notification email")?;

        let mailer = self.build_mailer(&settings)?;
        mailer
            .send(email)
            .await
            .context("Failed to send notification email")?;

        Ok(())
    }

    async fn load_email_settings(&self) -> Result<Option<EmailSettings>> {
        let settings_service = SystemSettingsService::new(self.mongo.clone());
        settings_service.get_email_settings().await
    }

    fn build_mailer(&self, settings: &EmailSettings) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
        let creds = Credentials::new(settings.login.clone(), settings.password.clone());

        let builder = if settings.use_tls {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&settings.server)
                .context("Invalid SMTP server for TLS")?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&settings.server)
        }
        .port(settings.port)
        .credentials(creds);

        Ok(builder.build())
    }
}
