import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import type { ExportRequestPayload, GroupStatsResponse } from '@/lib/api-types';
import { sanitizeDisplayName } from '@/lib/sanitization';

type PeriodKey = 'day' | 'week' | 'month';

const PERIODS: Record<PeriodKey, { label: string; days: number }> = {
  day: { label: 'Последние 24 часа', days: 1 },
  week: { label: 'Последние 7 дней', days: 7 },
  month: { label: 'Последние 30 дней', days: 30 },
};

@customElement('teacher-dashboard')
export class TeacherDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--surface-1);
      min-height: 100vh;
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
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.5rem, 4vw, 2.25rem);
    }

    .muted {
      color: var(--text-muted);
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.25rem;
      box-shadow: var(--shadow-soft);
    }

    .card h3 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metrics {
      font-size: 1.9rem;
      font-weight: 600;
    }

    .topic-picker {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.5rem;
      align-items: center;
    }

    .leaderboard {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1rem;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.5rem;
      text-align: left;
    }

    th {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    tr:nth-child(odd) {
      background: rgba(255, 255, 255, 0.02);
    }

    .leaderboard td.rank {
      font-weight: 600;
    }

    .export-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.25rem;
    }

    .export-form fieldset {
      border: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .export-form input,
    .export-form select,
    .export-form button,
    .export-form textarea {
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.65rem 0.8rem;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      font-size: 1rem;
      font-family: inherit;
    }

    button.primary {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }

    .status {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    .error {
      color: var(--error);
    }

    @media (max-width: 720px) {
      .page {
        padding: 1rem;
      }
    }
  `;

  @state()
  private loading = false;
  @state()
  private error?: string;
  @state()
  private stats?: GroupStatsResponse;
  @state()
  private topicFilter = '';
  @state()
  private exportFormat: 'csv' | 'pdf' = 'csv';
  @state()
  private period: PeriodKey = 'day';
  @state()
  private exportMessage?: string;
  @state()
  private lastUpdated?: string;

  private client: ApiClient;
  private pollingHandle?: number;
  private readonly groupId: string | null;

  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.groupId = params.get('groupId');
    const token = params.get('token') ?? undefined;
    this.client = new ApiClient({ jwt: token });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadStats();
    this.pollingHandle = window.setInterval(() => this.loadStats(), 30_000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pollingHandle) {
      window.clearInterval(this.pollingHandle);
    }
  }

  render() {
    if (!this.groupId) {
      return html`
        <div class="page">
          <h1>Teacher Dashboard</h1>
          <p class="muted">Укажите идентификатор группы через ?groupId=...</p>
        </div>
      `;
    }

    return html`
      <div class="page">
        <header>
          <div>
            <h1>Группа ${this.groupId}</h1>
            ${this.lastUpdated
              ? html`<p class="muted">Обновлено ${this.lastUpdated}</p>`
              : html`<p class="muted">Данные обновляются каждые 30 сек.</p>`}
          </div>
          ${this.loading
            ? html`<span class="muted">Загрузка...</span>`
            : html`<span class="muted"
                >${this.stats ? 'Данные свежие' : 'Нет данных'}</span
              >`}
        </header>
        ${this.renderError()} ${this.renderMetrics()} ${this.renderLeaderboard()}
        ${this.renderExportForm()}
      </div>
    `;
  }

  private renderMetrics() {
    if (!this.stats) {
      return null;
    }
    const metrics = this.stats.stats.metrics;
    return html`
      <div class="card-grid">
        <div class="card">
          <h3>Средняя точность</h3>
          <div class="metrics">${metrics.avg_accuracy?.toFixed(1) ?? '—'} %</div>
        </div>
        <div class="card">
          <h3>Средний балл</h3>
          <div class="metrics">${metrics.avg_score?.toFixed(0) ?? '—'}</div>
        </div>
        <div class="card">
          <h3>Попыток всего</h3>
          <div class="metrics">${metrics.total_attempts ?? '—'}</div>
        </div>
        <div class="card">
          <h3>Учеников в группе</h3>
          <div class="metrics">${metrics.total_users ?? '—'}</div>
        </div>
      </div>
    `;
  }

  private renderLeaderboard() {
    if (!this.stats?.leaderboard?.rankings?.length) {
      return html`
        <div class="leaderboard">
          <p class="muted">Лидерборд обновляется после расчётов.</p>
        </div>
      `;
    }
    const rankings = this.stats.leaderboard.rankings;
    return html`
      <div class="leaderboard">
        <h3>Лидерборд</h3>
        <table>
          <thead>
            <tr>
              <th>Место</th>
              <th>Ученик</th>
              <th>Баллы</th>
            </tr>
          </thead>
          <tbody>
            ${rankings.map(
              (entry) => html`
                <tr>
                  <td class="rank">${entry.rank}</td>
                  <td>${sanitizeDisplayName(entry.name)}</td>
                  <td>${entry.score}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderExportForm() {
    return html`
      <div class="export-form">
        <div class="status">
          <span>Экспорт CSV/PDF</span>
          ${this.exportMessage
            ? html`<span class="muted">${this.exportMessage}</span>`
            : null}
        </div>
        <fieldset>
          ${Object.entries(PERIODS).map(
            ([key, entry]) => html`
              <label>
                <input
                  type="radio"
                  name="period"
                  .value=${key}
                  .checked=${this.period === key}
                  @change=${() => (this.period = key as PeriodKey)}
                />
                ${entry.label}
              </label>
            `,
          )}
        </fieldset>
        <fieldset>
          <label>
            Формат:
            <select
              @change=${(event: Event) =>
                (this.exportFormat = (event.currentTarget as HTMLSelectElement).value as
                  | 'csv'
                  | 'pdf')}
            >
              <option value="csv" ?selected=${this.exportFormat === 'csv'}>CSV</option>
              <option value="pdf" ?selected=${this.exportFormat === 'pdf'}>PDF</option>
            </select>
          </label>
          <label style="flex:1">
            Топики (через запятую, optional):
            <textarea
              rows="2"
              .value=${this.topicFilter}
              @input=${(event: Event) =>
                (this.topicFilter = (event.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </fieldset>
        <button class="primary" @click=${this.onExport}>Запросить экспорт</button>
        <p class="muted">
          CSV/PDF хранится 24 часа, ссылка отправляется через Backend
          (email/telegram/интерфейс).
        </p>
      </div>
    `;
  }

  private renderError() {
    if (!this.error) {
      return null;
    }
    return html`<div class="card error">Ошибка: ${this.error}</div>`;
  }

  private async loadStats() {
    if (!this.groupId) {
      return;
    }
    this.loading = true;
    this.error = undefined;
    try {
      this.stats = await this.client.getGroupStats(this.groupId);
      this.lastUpdated = this.stats
        ? new Date(this.stats.stats.calculated_at).toLocaleTimeString()
        : undefined;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async onExport() {
    if (!this.groupId) {
      return;
    }
    const period = this.computePeriod();
    const payload: ExportRequestPayload = {
      topic_ids: this.topicFilter
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      period: {
        from: period.from,
        to: period.to,
      },
      format: this.exportFormat,
    };
    try {
      const response = await this.client.requestGroupExport(this.groupId, payload);
      this.exportMessage = `Экспорт ${response.export_id} в статусе ${response.status}`;
    } catch (error) {
      this.exportMessage = `Ошибка экспорта: ${(error as Error).message}`;
    }
  }

  private computePeriod() {
    const now = new Date();
    const days = PERIODS[this.period].days;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString(),
      to: now.toISOString(),
    };
  }
}
