import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type { ExportRequestPayload } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

type ReportFormat = 'csv' | 'pdf' | 'xlsx';
type ReportPeriod = 'week' | 'month' | 'quarter' | 'custom';

interface Report {
  id: string;
  period: string;
  format: ReportFormat;
  created_at: string;
  download_url?: string;
}

@customElement('teacher-reports')
export class TeacherReportsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.8rem, 3vw, 2.4rem);
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 1.2rem;
    }

    .muted {
      color: var(--text-muted);
      margin: 0.25rem 0 0;
    }

    .action-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.6rem 1rem;
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: transparent;
      color: inherit;
      text-decoration: none;
      font-weight: 600;
      transition: background 0.2s ease;
      cursor: pointer;
    }

    .action-link.primary {
      background: var(--primary);
      color: #fff;
      border-color: transparent;
    }

    .action-link:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    label {
      font-size: 0.85rem;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 600;
    }

    input,
    select {
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 0.65rem 0.8rem;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      font-size: 1rem;
      font-family: inherit;
    }

    input:focus,
    select:focus {
      outline: none;
      border-color: var(--primary);
      background: rgba(255, 255, 255, 0.08);
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    button {
      padding: 0.75rem 1.5rem;
      border-radius: var(--radius-small);
      border: none;
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    button:hover:not(:disabled) {
      background: var(--primary-dark);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status-message {
      padding: 1rem;
      border-radius: var(--radius-small);
      background: rgba(33, 150, 243, 0.1);
      border: 1px solid rgba(33, 150, 243, 0.3);
      color: #42a5f5;
      margin-top: 1rem;
    }

    .status-message.error {
      background: rgba(244, 67, 54, 0.1);
      border-color: rgba(244, 67, 54, 0.3);
      color: #ff5252;
    }

    .status-message.success {
      background: rgba(76, 175, 80, 0.1);
      border-color: rgba(76, 175, 80, 0.3);
      color: #66bb6a;
    }

    .table-wrapper {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      overflow-x: auto;
      box-shadow: var(--shadow-soft);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 640px;
    }

    th,
    td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    th {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      font-weight: 600;
    }

    tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .download-link {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
    }

    .download-link:hover {
      text-decoration: underline;
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--text-muted);
    }

    .progress {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-small);
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .progress-bar {
      height: 100%;
      background: var(--primary);
      border-radius: inherit;
      transition: width 0.3s ease;
    }

    @media (max-width: 720px) {
      .page {
        padding: 1rem;
      }

      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `;

  @state() private groupId: string | null = null;
  @state() private reportType: string = 'group_summary';
  @state() private period: ReportPeriod = 'month';
  @state() private format: ReportFormat = 'pdf';
  @state() private includeGraphs = true;
  @state() private includeDetails = true;
  @state() private startDate: string = '';
  @state() private endDate: string = '';
  @state() private generating = false;
  @state() private statusMessage: string = '';
  @state() private reports: Report[] = [];
  @state() private loading = false;
  @state() private currentExportId?: string;
  @state() private exportProgress = 0;

  private client: ApiClient;
  private pollingTimer?: number;

  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.groupId = params.get('groupId');
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
    this.initDateDefaults();
  }

  private initDateDefaults() {
    const today = new Date();
    this.endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    this.startDate = startDate.toISOString().split('T')[0];
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadReports();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pollingTimer) {
      window.clearInterval(this.pollingTimer);
    }
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header>
          <div>
            <h1>Генератор отчётов</h1>
            <p class="muted">Создавайте и скачивайте отчёты по группе и ученикам.</p>
          </div>
          <a class="action-link" href="/teacher-dashboard">← Назад</a>
        </header>

        <div class="card">
          <h2>Новый отчёт</h2>

          <div class="form-row">
            <div class="form-group">
              <label>Тип отчёта</label>
              <select .value=${this.reportType} @change=${this.onReportTypeChange}>
                <option value="group_summary">Сводный по группе</option>
                <option value="student_detail">Детальный по ученику</option>
                <option value="topic_analysis">По теме</option>
              </select>
            </div>

            <div class="form-group">
              <label>Период</label>
              <select .value=${this.period} @change=${this.onPeriodChange}>
                <option value="week">За неделю</option>
                <option value="month">За месяц</option>
                <option value="quarter">За квартал</option>
                <option value="custom">Кастомный</option>
              </select>
            </div>

            <div class="form-group">
              <label>Формат</label>
              <select .value=${this.format} @change=${this.onFormatChange}>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
              </select>
            </div>
          </div>

          ${this.period === 'custom'
            ? html`
                <div class="form-row">
                  <div class="form-group">
                    <label>От (дата)</label>
                    <input
                      type="date"
                      .value=${this.startDate}
                      @change=${(e: Event) =>
                        (this.startDate = (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="form-group">
                    <label>До (дата)</label>
                    <input
                      type="date"
                      .value=${this.endDate}
                      @change=${(e: Event) =>
                        (this.endDate = (e.target as HTMLInputElement).value)}
                    />
                  </div>
                </div>
              `
            : null}

          <div class="form-row">
            <label>
              <input
                type="checkbox"
                .checked=${this.includeGraphs}
                @change=${(e: Event) =>
                  (this.includeGraphs = (e.target as HTMLInputElement).checked)}
              />
              Включить графики
            </label>
            <label>
              <input
                type="checkbox"
                .checked=${this.includeDetails}
                @change=${(e: Event) =>
                  (this.includeDetails = (e.target as HTMLInputElement).checked)}
              />
              Включить детали по ученикам
            </label>
          </div>

          <button
            ?disabled=${this.generating || !this.groupId}
            @click=${this.onGenerateReport}
          >
            ${this.generating ? 'Генерируется...' : 'Сгенерировать отчёт'}
          </button>

          ${this.generating && this.currentExportId
            ? html`
                <div class="progress">
                  <div class="progress-bar" style="width: ${this.exportProgress}%"></div>
                </div>
                <p class="muted" style="font-size: 0.85rem; margin-top: 0.5rem;">
                  ${this.exportProgress}% выполнено...
                </p>
              `
            : null}
          ${this.statusMessage
            ? html`
                <div
                  class=${`status-message ${this.statusMessage.includes('Ошибка') ? 'error' : 'success'}`}
                >
                  ${this.statusMessage}
                </div>
              `
            : null}
        </div>

        <div class="card">
          <h2>История отчётов</h2>
          ${this.loading
            ? html`<div class="empty">Загрузка...</div>`
            : this.reports.length > 0
              ? this.renderReportsTable()
              : html`<div class="empty">Отчётов пока нет</div>`}
        </div>
      </div>
    `;
  }

  private renderReportsTable() {
    return html`
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Период</th>
              <th>Формат</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            ${this.reports.map(
              (report) => html`
                <tr>
                  <td>${new Date(report.created_at).toLocaleDateString('ru-RU')}</td>
                  <td>${report.period}</td>
                  <td>${report.format.toUpperCase()}</td>
                  <td>
                    ${report.download_url
                      ? html`
                          <a
                            class="download-link"
                            href=${report.download_url}
                            target="_blank"
                            rel="noopener"
                          >
                            Скачать
                          </a>
                        `
                      : html`<span class="muted">Ожидание...</span>`}
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private onReportTypeChange(e: Event) {
    this.reportType = (e.target as HTMLSelectElement).value;
  }

  private onPeriodChange(e: Event) {
    this.period = (e.target as HTMLSelectElement).value as ReportPeriod;
  }

  private onFormatChange(e: Event) {
    this.format = (e.target as HTMLSelectElement).value as ReportFormat;
  }

  private async onGenerateReport() {
    if (!this.groupId) return;

    this.generating = true;
    this.statusMessage = '';

    try {
      const period = this.getPeriodDates();
      const payload: ExportRequestPayload = {
        topic_ids: [],
        period: {
          from: period.from,
          to: period.to,
        },
        format: this.format,
      };

      const response = await this.client.requestGroupExport(this.groupId, payload);
      this.currentExportId = response.export_id;
      this.statusMessage = 'Отчёт создаётся...';

      // Начать опрос статуса
      this.startExportPolling();
    } catch (error) {
      this.statusMessage = `Ошибка: ${(error as Error).message}`;
      this.generating = false;
    }
  }

  private getPeriodDates(): { from: string; to: string } {
    const now = new Date();
    let from = new Date();

    switch (this.period) {
      case 'week':
        from.setDate(now.getDate() - 7);
        break;
      case 'month':
        from.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        from.setMonth(now.getMonth() - 3);
        break;
      case 'custom':
        from = new Date(this.startDate);
        now.setTime(new Date(this.endDate).getTime());
        break;
      default:
        from.setMonth(now.getMonth() - 1);
    }

    return {
      from: from.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }

  private startExportPolling() {
    if (this.pollingTimer) {
      window.clearInterval(this.pollingTimer);
    }

    this.pollingTimer = window.setInterval(async () => {
      if (!this.currentExportId) return;

      try {
        const status = await this.client.getExportStatus(this.currentExportId);

        switch (status.status) {
          case 'pending':
            this.exportProgress = 25;
            break;
          case 'processing':
            this.exportProgress = 75;
            break;
          case 'ready':
            this.exportProgress = 100;
            this.statusMessage = 'Отчёт готов! Скачивание...';
            this.generating = false;
            if (this.pollingTimer) {
              window.clearInterval(this.pollingTimer);
            }
            this.loadReports();
            break;
          case 'failed':
            this.statusMessage = `Ошибка при создании отчёта: ${status.error}`;
            this.generating = false;
            if (this.pollingTimer) {
              window.clearInterval(this.pollingTimer);
            }
            break;
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);
  }

  private async loadReports() {
    this.loading = true;
    try {
      // Имитируем загрузку истории отчётов
      // В реальном приложении это будет отдельный API endpoint
      this.reports = [];
    } finally {
      this.loading = false;
    }
  }
}
