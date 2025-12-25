use std::time::Duration;

use anyhow::Result;
use tokio::time::sleep;
use tracing::{info, warn};

use crate::{
    config::Config,
    metrics::{EXPORTS_GENERATED_TOTAL, EXPORT_WORKER_TICKS_TOTAL},
    models::reporting::{ExportFormat, ExportStatus, LeaderboardScope, ReportExport},
    services::{object_storage::ObjectStorageClient, reporting_service::ReportingService},
};

/// Escapes CSV field to prevent formula injection attacks.
/// Prefixes dangerous characters (=, +, @, -, tab, newline) with a tab to neutralize them.
/// Also wraps fields containing special characters in quotes.
fn escape_csv_field(value: &str) -> String {
    // Prevent formula injection by prefixing dangerous characters with tab
    let sanitized = if value.starts_with(['=', '+', '@', '-', '\t', '\r', '\n']) {
        format!("\t{}", value)
    } else {
        value.to_string()
    };

    // Escape quotes and wrap in quotes if contains special characters
    if sanitized.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", sanitized.replace('"', "\"\""))
    } else {
        sanitized
    }
}

pub struct ExportWorker {
    reporting_service: ReportingService,
    object_storage: ObjectStorageClient,
    config: Config,
}

impl ExportWorker {
    pub fn new(
        reporting_service: ReportingService,
        object_storage: ObjectStorageClient,
        config: Config,
    ) -> Self {
        Self {
            reporting_service,
            object_storage,
            config,
        }
    }

    pub async fn run(&self) -> Result<()> {
        let interval = Duration::from_secs(self.config.reporting.export_worker_interval_secs);
        info!("Starting export worker (interval={}s)", interval.as_secs());

        loop {
            match self.process_pending().await {
                Ok(_) => {
                    EXPORT_WORKER_TICKS_TOTAL
                        .with_label_values(&["success"])
                        .inc();
                    info!("Export worker tick completed");
                }
                Err(err) => {
                    EXPORT_WORKER_TICKS_TOTAL
                        .with_label_values(&["error"])
                        .inc();
                    warn!(error = %err, "export worker tick failed");
                }
            }

            sleep(interval).await;
        }
    }

    async fn process_pending(&self) -> Result<()> {
        let pending = self.reporting_service.fetch_pending_exports(10).await?;
        if pending.is_empty() {
            return Ok(());
        }

        for export in pending {
            let export_id = export.id;
            if let Err(err) = self.process_export(export).await {
                warn!(error = %err, export = %export_id, "failed to process export");
            }
        }

        Ok(())
    }

    async fn process_export(&self, export: ReportExport) -> Result<()> {
        self.reporting_service
            .update_export_status(&export.id, ExportStatus::Processing, None, None)
            .await?;

        let (stats, leaderboard) = tokio::try_join!(
            self.reporting_service.load_group_snapshot(&export.group_id),
            self.reporting_service
                .load_leaderboard(LeaderboardScope::Group, Some(&export.group_id))
        )?;

        let csv = self.build_csv(&export, stats.as_ref(), leaderboard.as_ref());
        let extension = match export.format {
            ExportFormat::Csv => "csv",
            ExportFormat::Pdf => "pdf",
        };
        let content_type = if extension == "pdf" {
            "application/pdf"
        } else {
            "text/csv"
        };

        let key = self.object_storage.build_export_key(
            &export.group_id.to_string(),
            &export.id.to_string(),
            extension,
        );

        self.object_storage
            .upload_bytes(&key, csv, content_type)
            .await?;

        self.reporting_service
            .update_export_status(&export.id, ExportStatus::Ready, Some(&key), None)
            .await?;

        EXPORTS_GENERATED_TOTAL
            .with_label_values(&[extension])
            .inc();

        info!(export = %export.id, "export completed");
        Ok(())
    }

    fn build_csv(
        &self,
        export: &ReportExport,
        stats: Option<&crate::models::reporting::MaterializedStat>,
        leaderboard: Option<&crate::models::reporting::LeaderboardDocument>,
    ) -> Vec<u8> {
        let mut lines = vec![
            "Metric,Value".to_string(),
            format!("Group ID,{}", export.group_id),
            format!(
                "Format,{}",
                match export.format {
                    ExportFormat::Csv => "CSV",
                    ExportFormat::Pdf => "PDF",
                }
            ),
            format!("Created At,{}", export.created_at),
        ];

        if let Some(stats) = stats {
            let metrics = &stats.metrics;
            if let Some(avg_accuracy) = metrics.get("avg_accuracy") {
                lines.push(format!("Avg Accuracy,{}", avg_accuracy));
            }
            if let Some(avg_score) = metrics.get("avg_score") {
                lines.push(format!("Avg Score,{}", avg_score));
            }
            if let Some(total_attempts) = metrics.get("total_attempts") {
                lines.push(format!("Total Attempts,{}", total_attempts));
            }
            if let Some(total_users) = metrics.get("total_users") {
                lines.push(format!("Total Users,{}", total_users));
            }
        }

        lines.push("".into());
        lines.push("Leaderboard".into());
        lines.push("Rank,User,Score".into());

        if let Some(lb) = leaderboard {
            for entry in &lb.rankings {
                lines.push(format!(
                    "{},{},{}",
                    entry.rank,
                    escape_csv_field(&entry.name),
                    entry.score
                ));
            }
        }

        lines.join("\n").into_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csv_escape_formula_injection() {
        // Test formula injection prevention
        assert_eq!(escape_csv_field("=1+1"), "\t=1+1");
        assert_eq!(escape_csv_field("+cmd"), "\t+cmd");
        assert_eq!(escape_csv_field("@SUM(A1)"), "\t@SUM(A1)");
        assert_eq!(escape_csv_field("-2+3"), "\t-2+3");

        // Test normal names
        assert_eq!(escape_csv_field("Normal Name"), "Normal Name");
        assert_eq!(escape_csv_field("John Doe"), "John Doe");
        assert_eq!(escape_csv_field("Иван Иванов"), "Иван Иванов");

        // Test special characters that need quoting
        assert_eq!(escape_csv_field("Name, Jr."), "\"Name, Jr.\"");
        assert_eq!(escape_csv_field("O\"Brien"), "\"O\"\"Brien\"");

        // Test combination: formula + special chars
        assert_eq!(escape_csv_field("=1+1, test"), "\"\t=1+1, test\"");
    }

    #[test]
    fn test_csv_escape_edge_cases() {
        // Empty string
        assert_eq!(escape_csv_field(""), "");

        // Only dangerous character
        assert_eq!(escape_csv_field("="), "\t=");
        assert_eq!(escape_csv_field("+"), "\t+");

        // Newline and carriage return (must be quoted because they're special in CSV)
        assert_eq!(escape_csv_field("\n"), "\"\t\n\"");
        assert_eq!(escape_csv_field("\r"), "\"\t\r\"");

        // Tab character (starts with tab, so gets prefixed with another tab)
        assert_eq!(escape_csv_field("\t"), "\t\t");
    }
}
