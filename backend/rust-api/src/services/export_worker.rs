use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use mongodb::bson::Bson;
use printpdf::{
    BuiltinFont, Color, Greyscale, Line, LinePoint, Mm, Op, PaintMode, PdfDocument, PdfPage,
    PdfSaveOptions, Point, Polygon, PolygonRing, Pt, Rgb, TextItem, WindingOrder,
};
use rust_xlsxwriter::{Format, Workbook};
use tokio::time::sleep;
use tracing::{info, warn};

use crate::{
    config::Config,
    metrics::{EXPORTS_GENERATED_TOTAL, EXPORT_WORKER_TICKS_TOTAL},
    models::reporting::{
        ExportFormat, ExportStatus, LeaderboardDocument, LeaderboardScope, MaterializedStat,
        ReportExport, TimeRange,
    },
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

        let (payload, extension, content_type) = match export.format {
            ExportFormat::Csv => (
                self.build_csv(&export, stats.as_ref(), leaderboard.as_ref()),
                "csv",
                "text/csv",
            ),
            ExportFormat::Pdf => (
                self.build_pdf(&export, stats.as_ref(), leaderboard.as_ref())?,
                "pdf",
                "application/pdf",
            ),
            ExportFormat::Xlsx => (
                self.build_xlsx(&export, stats.as_ref(), leaderboard.as_ref())?,
                "xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        };

        let key = self.object_storage.build_export_key(
            &export.group_id.to_string(),
            &export.id.to_string(),
            extension,
        );

        self.object_storage
            .upload_bytes(&key, payload, content_type)
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
                    ExportFormat::Xlsx => "XLSX",
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

    fn build_pdf(
        &self,
        export: &ReportExport,
        stats: Option<&MaterializedStat>,
        leaderboard: Option<&LeaderboardDocument>,
    ) -> Result<Vec<u8>> {
        let mut document = PdfDocument::new("Групповой отчёт");
        let summary_rows = Self::summary_metrics(stats);
        let leaderboard_rows = Self::leaderboard_rows(leaderboard);
        let mut ops = Vec::new();

        let accent_color = Color::Rgb(Rgb {
            r: 0.16,
            g: 0.4,
            b: 0.69,
            icc_profile: None,
        });
        let bar_palette = [
            Color::Rgb(Rgb {
                r: 0.23,
                g: 0.52,
                b: 0.87,
                icc_profile: None,
            }),
            Color::Rgb(Rgb {
                r: 0.33,
                g: 0.66,
                b: 0.53,
                icc_profile: None,
            }),
            Color::Rgb(Rgb {
                r: 0.89,
                g: 0.57,
                b: 0.28,
                icc_profile: None,
            }),
        ];
        let text_color = Color::Greyscale(Greyscale::new(0.08, None));
        let border_color = Color::Greyscale(Greyscale::new(0.65, None));

        let title = format!("Отчёт по группе {}", export.group_id);
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(20.0), Mm(275.0)),
            BuiltinFont::HelveticaBold,
            18.0,
            22.0,
            title,
            &accent_color,
        );
        let period_label = Self::format_period(&export.filters.period);
        let format_label = match export.format {
            ExportFormat::Csv => "CSV",
            ExportFormat::Pdf => "PDF",
            ExportFormat::Xlsx => "XLSX",
        };
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(20.0), Mm(263.0)),
            BuiltinFont::Helvetica,
            11.0,
            14.0,
            format!("Период: {period_label}"),
            &text_color,
        );
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(20.0), Mm(255.0)),
            BuiltinFont::Helvetica,
            11.0,
            14.0,
            format!(
                "Формат: {format_label} • Сформирован: {}",
                Self::format_timestamp(&export.created_at)
            ),
            &text_color,
        );

        // Summary table (left column).
        let summary_left = 20.0_f32;
        let summary_top = 245.0_f32;
        let summary_row_height = 10.0_f32;
        let summary_columns = [75.0_f32, 55.0_f32];
        let summary_row_count = summary_rows.len().max(1) + 1;
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(summary_left), Mm(summary_top + 8.0)),
            BuiltinFont::HelveticaBold,
            12.0,
            15.0,
            "Сводные метрики".into(),
            &accent_color,
        );
        ops.push(Op::SetOutlineColor {
            col: border_color.clone(),
        });
        ops.push(Op::SetOutlineThickness { pt: Pt(0.6) });
        Self::draw_table_grid(
            &mut ops,
            summary_left,
            summary_top,
            summary_row_height,
            &summary_columns,
            summary_row_count,
        );
        let mut summary_y = summary_top - 7.0;
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(summary_left + 3.0), Mm(summary_y)),
            BuiltinFont::HelveticaBold,
            10.0,
            12.0,
            "Метрика".into(),
            &text_color,
        );
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(summary_left + summary_columns[0] + 3.0), Mm(summary_y)),
            BuiltinFont::HelveticaBold,
            10.0,
            12.0,
            "Значение".into(),
            &text_color,
        );
        summary_y -= summary_row_height;
        if summary_rows.is_empty() {
            Self::push_pdf_text(
                &mut ops,
                Point::new(Mm(summary_left + 3.0), Mm(summary_y)),
                BuiltinFont::Helvetica,
                10.0,
                12.0,
                "Нет данных".into(),
                &text_color,
            );
        } else {
            for (metric, value) in summary_rows {
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(Mm(summary_left + 3.0), Mm(summary_y)),
                    BuiltinFont::Helvetica,
                    10.0,
                    12.0,
                    metric,
                    &text_color,
                );
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(Mm(summary_left + summary_columns[0] + 3.0), Mm(summary_y)),
                    BuiltinFont::Helvetica,
                    10.0,
                    12.0,
                    value,
                    &text_color,
                );
                summary_y -= summary_row_height;
            }
        }

        // Leaderboard chart (right column).
        let chart_left = 125.0_f32;
        let chart_bottom = 110.0_f32;
        let chart_height = 115.0_f32;
        let chart_width = 70.0_f32;
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(chart_left), Mm(chart_bottom + chart_height + 12.0)),
            BuiltinFont::HelveticaBold,
            12.0,
            15.0,
            "Распределение баллов".into(),
            &accent_color,
        );
        {
            let chart_entries = leaderboard_rows.iter().take(5).cloned().collect::<Vec<_>>();
            if chart_entries.is_empty() {
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(Mm(chart_left), Mm(chart_bottom + chart_height / 2.0)),
                    BuiltinFont::Helvetica,
                    10.0,
                    12.0,
                    "Нет данных для графика".into(),
                    &text_color,
                );
            } else {
                let mut max_score = leaderboard_rows
                    .iter()
                    .map(|(_, _, score)| *score)
                    .max()
                    .unwrap_or(1);
                if max_score <= 0 {
                    max_score = 1;
                }

                ops.push(Op::SetOutlineColor {
                    col: accent_color.clone(),
                });
                ops.push(Op::SetOutlineThickness { pt: Pt(0.8) });
                Self::push_pdf_line(
                    &mut ops,
                    (chart_left, chart_bottom),
                    (chart_left, chart_bottom + chart_height),
                );
                Self::push_pdf_line(
                    &mut ops,
                    (chart_left, chart_bottom),
                    (chart_left + chart_width, chart_bottom),
                );

                let bar_count = chart_entries.len();
                let spacing = 4.0_f32;
                let total_spacing = spacing * (bar_count as f32 + 1.0);
                let mut bar_width = ((chart_width - total_spacing) / bar_count as f32).max(9.0_f32);
                if bar_width.is_nan() {
                    bar_width = 9.0;
                }
                let mut current_x = chart_left + spacing;
                for (idx, (rank, name, score)) in chart_entries.into_iter().enumerate() {
                    let score_value = score;
                    let ratio = (score_value as f32 / max_score as f32).clamp(0.0, 1.0);
                    let bar_height = ratio * chart_height;
                    let color = bar_palette[idx % bar_palette.len()].clone();
                    Self::push_pdf_rect(
                        &mut ops,
                        current_x,
                        chart_bottom,
                        bar_width,
                        bar_height,
                        &color,
                    );
                    let score_label_y = chart_bottom + bar_height + 3.0;
                    Self::push_pdf_text(
                        &mut ops,
                        Point::new(Mm(current_x), Mm(score_label_y)),
                        BuiltinFont::Helvetica,
                        9.0,
                        11.0,
                        format!("{score_value}"),
                        &text_color,
                    );
                    Self::push_pdf_text(
                        &mut ops,
                        Point::new(Mm(current_x), Mm(chart_bottom - 6.0)),
                        BuiltinFont::Helvetica,
                        8.0,
                        10.0,
                        format!("#{rank} {}", Self::shorten_label(&name, 11)),
                        &text_color,
                    );
                    current_x += bar_width + spacing;
                }
            }
        }

        // Leaderboard table (full width at the bottom).
        let leaderboard_top = 105.0_f32;
        let leaderboard_left = 20.0_f32;
        let leaderboard_row_height = 9.0_f32;
        let leaderboard_columns = [18.0_f32, 100.0_f32, 37.0_f32];
        let leaderboard_limit = 10;
        let leaderboard_visible: Vec<(u32, String, i64)> = leaderboard_rows
            .iter()
            .take(leaderboard_limit)
            .cloned()
            .collect();
        let leaderboard_row_count = leaderboard_visible.len().max(1) + 1;
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(leaderboard_left), Mm(leaderboard_top + 8.0)),
            BuiltinFont::HelveticaBold,
            12.0,
            15.0,
            "Таблица лидеров".into(),
            &accent_color,
        );
        ops.push(Op::SetOutlineColor {
            col: border_color.clone(),
        });
        ops.push(Op::SetOutlineThickness { pt: Pt(0.5) });
        Self::draw_table_grid(
            &mut ops,
            leaderboard_left,
            leaderboard_top,
            leaderboard_row_height,
            &leaderboard_columns,
            leaderboard_row_count,
        );
        let mut leaderboard_y = leaderboard_top - 6.5;
        Self::push_pdf_text(
            &mut ops,
            Point::new(Mm(leaderboard_left + 2.0), Mm(leaderboard_y)),
            BuiltinFont::HelveticaBold,
            9.5,
            10.0,
            "Место".into(),
            &text_color,
        );
        Self::push_pdf_text(
            &mut ops,
            Point::new(
                Mm(leaderboard_left + leaderboard_columns[0] + 2.0),
                Mm(leaderboard_y),
            ),
            BuiltinFont::HelveticaBold,
            9.5,
            10.0,
            "Ученик".into(),
            &text_color,
        );
        Self::push_pdf_text(
            &mut ops,
            Point::new(
                Mm(leaderboard_left + leaderboard_columns[0] + leaderboard_columns[1] + 2.0),
                Mm(leaderboard_y),
            ),
            BuiltinFont::HelveticaBold,
            9.5,
            10.0,
            "Баллы".into(),
            &text_color,
        );
        leaderboard_y -= leaderboard_row_height;
        if leaderboard_visible.is_empty() {
            Self::push_pdf_text(
                &mut ops,
                Point::new(Mm(leaderboard_left + 2.0), Mm(leaderboard_y)),
                BuiltinFont::Helvetica,
                9.5,
                11.0,
                "Нет данных".into(),
                &text_color,
            );
        } else {
            for (rank, name, score) in leaderboard_visible {
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(Mm(leaderboard_left + 2.0), Mm(leaderboard_y)),
                    BuiltinFont::Helvetica,
                    9.5,
                    11.0,
                    format!("{rank}"),
                    &text_color,
                );
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(
                        Mm(leaderboard_left + leaderboard_columns[0] + 2.0),
                        Mm(leaderboard_y),
                    ),
                    BuiltinFont::Helvetica,
                    9.5,
                    11.0,
                    name,
                    &text_color,
                );
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(
                        Mm(leaderboard_left
                            + leaderboard_columns[0]
                            + leaderboard_columns[1]
                            + 2.0),
                        Mm(leaderboard_y),
                    ),
                    BuiltinFont::Helvetica,
                    9.5,
                    11.0,
                    format!("{score}"),
                    &text_color,
                );
                leaderboard_y -= leaderboard_row_height;
                if leaderboard_y < 15.0 {
                    break;
                }
            }
        }
        if leaderboard_rows.len() > leaderboard_limit {
            let note_y =
                leaderboard_top - leaderboard_row_height * leaderboard_row_count as f32 - 4.0;
            if note_y > 5.0 {
                Self::push_pdf_text(
                    &mut ops,
                    Point::new(Mm(leaderboard_left), Mm(note_y)),
                    BuiltinFont::HelveticaOblique,
                    8.0,
                    9.0,
                    format!("Показаны первые {leaderboard_limit} записей"),
                    &text_color,
                );
            }
        }

        let page = PdfPage::new(Mm(210.0), Mm(297.0), ops);
        let mut warnings = Vec::new();
        let bytes = document
            .with_pages(vec![page])
            .save(&PdfSaveOptions::default(), &mut warnings);
        Ok(bytes)
    }

    fn build_xlsx(
        &self,
        export: &ReportExport,
        stats: Option<&MaterializedStat>,
        leaderboard: Option<&LeaderboardDocument>,
    ) -> Result<Vec<u8>> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_column_width(0, 28.0)?;
        worksheet.set_column_width(1, 24.0)?;

        let header_format = Format::new().set_bold();

        let mut row = 0;
        worksheet.write_string(row, 0, "Отчёт ID")?;
        worksheet.write_string(row, 1, export.id.to_hex())?;
        row += 1;
        worksheet.write_string(row, 0, "Группа")?;
        worksheet.write_string(row, 1, export.group_id.to_hex())?;
        row += 1;
        worksheet.write_string(row, 0, "Формат")?;
        worksheet.write_string(row, 1, export.format.as_label())?;
        row += 1;
        worksheet.write_string(row, 0, "Период")?;
        worksheet.write_string(row, 1, Self::format_period(&export.filters.period))?;
        row += 2;

        worksheet.write_string_with_format(row, 0, "Метрика", &header_format)?;
        worksheet.write_string_with_format(row, 1, "Значение", &header_format)?;
        row += 1;

        let metrics = Self::summary_metrics(stats);
        if metrics.is_empty() {
            worksheet.write_string(row, 0, "Недоступно")?;
            worksheet.write_string(row, 1, "Нет данных")?;
            row += 2;
        } else {
            for (label, value) in metrics {
                worksheet.write_string(row, 0, &label)?;
                worksheet.write_string(row, 1, &value)?;
                row += 1;
            }
            row += 1;
        }

        worksheet.write_string_with_format(row, 0, "Лидерборд", &header_format)?;
        row += 1;
        worksheet.write_string_with_format(row, 0, "Место", &header_format)?;
        worksheet.write_string_with_format(row, 1, "Ученик", &header_format)?;
        worksheet.write_string_with_format(row, 2, "Баллы", &header_format)?;
        row += 1;

        let leaderboard_rows = Self::leaderboard_rows(leaderboard);
        if leaderboard_rows.is_empty() {
            worksheet.write_string(row, 0, "—")?;
            worksheet.write_string(row, 1, "Нет данных")?;
        } else {
            for (rank, name, score) in leaderboard_rows {
                worksheet.write_number(row, 0, rank as f64)?;
                worksheet.write_string(row, 1, &name)?;
                worksheet.write_number(row, 2, score as f64)?;
                row += 1;
            }
        }

        let mut cursor = std::io::Cursor::new(Vec::new());
        workbook.save_to_writer(&mut cursor)?;
        Ok(cursor.into_inner())
    }

    fn summary_metrics(stats: Option<&MaterializedStat>) -> Vec<(String, String)> {
        let mut rows = Vec::new();
        let Some(stats) = stats else {
            return rows;
        };
        let metrics = &stats.metrics;
        if let Some(value) = metrics.get("avg_accuracy").and_then(Self::bson_to_f64) {
            rows.push(("Средняя точность".into(), format!("{value:.1}%")));
        }
        if let Some(value) = metrics.get("avg_score").and_then(Self::bson_to_f64) {
            rows.push(("Средний балл".into(), format!("{value:.1}")));
        }
        if let Some(value) = metrics.get("total_attempts").and_then(Self::bson_to_i64) {
            rows.push(("Всего попыток".into(), value.to_string()));
        }
        if let Some(value) = metrics.get("total_users").and_then(Self::bson_to_i64) {
            rows.push(("Ученики".into(), value.to_string()));
        }
        rows
    }

    fn leaderboard_rows(leaderboard: Option<&LeaderboardDocument>) -> Vec<(u32, String, i64)> {
        leaderboard
            .map(|lb| {
                lb.rankings
                    .iter()
                    .map(|entry| (entry.rank, entry.name.clone(), entry.score))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn bson_to_f64(value: &Bson) -> Option<f64> {
        match value {
            Bson::Double(v) => Some(*v),
            Bson::Int32(v) => Some(*v as f64),
            Bson::Int64(v) => Some(*v as f64),
            _ => None,
        }
    }

    fn bson_to_i64(value: &Bson) -> Option<i64> {
        match value {
            Bson::Int32(v) => Some((*v).into()),
            Bson::Int64(v) => Some(*v),
            _ => None,
        }
    }

    fn format_timestamp(value: &DateTime<Utc>) -> String {
        value.format("%Y-%m-%d %H:%M:%S UTC").to_string()
    }

    fn format_period(range: &TimeRange) -> String {
        format!(
            "{} — {}",
            range.from.format("%Y-%m-%d %H:%M"),
            range.to.format("%Y-%m-%d %H:%M")
        )
    }

    fn push_pdf_text(
        ops: &mut Vec<Op>,
        pos: Point,
        font: BuiltinFont,
        font_size: f32,
        line_height: f32,
        text: String,
        color: &Color,
    ) {
        ops.extend([
            Op::StartTextSection,
            Op::SetTextCursor { pos },
            Op::SetFontSizeBuiltinFont {
                size: Pt(font_size),
                font,
            },
            Op::SetLineHeight {
                lh: Pt(line_height),
            },
            Op::SetFillColor { col: color.clone() },
            Op::WriteTextBuiltinFont {
                items: vec![TextItem::Text(text)],
                font,
            },
            Op::EndTextSection,
        ]);
    }

    fn push_pdf_line(ops: &mut Vec<Op>, from: (f32, f32), to: (f32, f32)) {
        ops.push(Op::DrawLine {
            line: Line {
                points: vec![
                    LinePoint {
                        p: Point::new(Mm(from.0), Mm(from.1)),
                        bezier: false,
                    },
                    LinePoint {
                        p: Point::new(Mm(to.0), Mm(to.1)),
                        bezier: false,
                    },
                ],
                is_closed: false,
            },
        });
    }

    fn push_pdf_rect(
        ops: &mut Vec<Op>,
        left: f32,
        bottom: f32,
        width: f32,
        height: f32,
        color: &Color,
    ) {
        if width <= 0.0 || height <= 0.0 {
            return;
        }
        let ring = PolygonRing {
            points: vec![
                LinePoint {
                    p: Point::new(Mm(left), Mm(bottom)),
                    bezier: false,
                },
                LinePoint {
                    p: Point::new(Mm(left + width), Mm(bottom)),
                    bezier: false,
                },
                LinePoint {
                    p: Point::new(Mm(left + width), Mm(bottom + height)),
                    bezier: false,
                },
                LinePoint {
                    p: Point::new(Mm(left), Mm(bottom + height)),
                    bezier: false,
                },
            ],
        };
        let polygon = Polygon {
            rings: vec![ring],
            mode: PaintMode::Fill,
            winding_order: WindingOrder::NonZero,
        };
        ops.push(Op::SetFillColor { col: color.clone() });
        ops.push(Op::DrawPolygon { polygon });
    }

    fn draw_table_grid(
        ops: &mut Vec<Op>,
        left: f32,
        top: f32,
        row_height: f32,
        columns: &[f32],
        row_count: usize,
    ) {
        if row_count == 0 {
            return;
        }
        let total_width: f32 = columns.iter().copied().sum();
        let table_height = row_height * row_count as f32;
        for idx in 0..=row_count {
            let y = top - row_height * idx as f32;
            Self::push_pdf_line(ops, (left, y), (left + total_width, y));
        }
        let mut x = left;
        for width in columns {
            Self::push_pdf_line(ops, (x, top), (x, top - table_height));
            x += *width;
        }
        Self::push_pdf_line(ops, (x, top), (x, top - table_height));
    }

    fn shorten_label(label: &str, max_chars: usize) -> String {
        if label.chars().count() <= max_chars {
            return label.to_string();
        }

        let mut collected = String::new();
        for ch in label.chars().take(max_chars.saturating_sub(1)) {
            collected.push(ch);
        }
        collected.push('…');
        collected
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
