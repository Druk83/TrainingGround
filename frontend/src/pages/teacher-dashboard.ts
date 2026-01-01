import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type {
  ActivityEntry,
  ExportRequestPayload,
  ExportStatusPayload,
  GroupResponse,
  GroupStatsResponse,
  RecommendationEntry,
  TopicAnalyticsEntry,
} from '@/lib/api-types';
import { authService } from '@/lib/auth-service';
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

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .header-title h1 {
      margin: 0;
    }

    .header-controls {
      display: flex;
      gap: 0.75rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .group-selector span {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }

    .group-selector select {
      min-width: 200px;
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      padding: 0.4rem 0.75rem;
      font-family: inherit;
    }

    .header-buttons {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
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
    }

    .action-link.primary {
      background: var(--primary);
      color: #fff;
      border-color: transparent;
    }

    .action-link:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .group-meta {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .group-meta div span {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .group-meta strong {
      display: block;
      font-size: 1rem;
    }

    .analytics-section {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.25rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .analytics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .analytics-table th,
    .analytics-table td {
      padding: 0.55rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .analytics-table th {
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .activity-chart {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
      gap: 0.5rem;
      align-items: end;
      min-height: 120px;
    }

    .activity-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .activity-bar span.bar {
      width: 100%;
      height: 60px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-small);
      position: relative;
      overflow: hidden;
    }

    .activity-bar span.bar-fill {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 100%;
      background: var(--primary);
      border-radius: inherit;
    }

    .activity-bar small {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .recommendation-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .recommendation {
      background: rgba(255, 255, 255, 0.04);
      padding: 0.75rem 1rem;
      border-radius: var(--radius-small);
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

    .export-form .download-link {
      text-decoration: none;
      align-self: flex-start;
      margin-top: 0.5rem;
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

  @state() declare private loading: boolean;
  @state() declare private error?: string;
  @state() declare private stats?: GroupStatsResponse;
  @state() declare private topicFilter: string;
  @state() declare private exportFormat: 'csv' | 'pdf' | 'xlsx';
  @state() declare private period: PeriodKey;
  @state() declare private exportMessage?: string;
  @state() declare private exportStatus?: ExportStatusPayload;
  @state() declare private lastUpdated?: string;
  @state() declare private groupId: string | null;
  @state() declare private groups: GroupResponse[];
  @state() declare private selectedGroup?: GroupResponse;
  @state() declare private groupLoading: boolean;
  @state() declare private analyticsLoading: boolean;
  @state() declare private analyticsError?: string;
  @state() declare private topicAnalytics: TopicAnalyticsEntry[];
  @state() declare private activityData: ActivityEntry[];
  @state() declare private recommendations: RecommendationEntry[];

  private client: ApiClient;
  private pollingHandle?: number;
  private exportPollTimer?: number;

  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.groupId = params.get('groupId');

    // Initialize state properties
    this.loading = false;
    this.topicFilter = '';
    this.exportFormat = 'csv';
    this.period = 'day';
    this.groups = [];
    this.groupLoading = false;
    this.selectedGroup = undefined;
    this.analyticsLoading = false;
    this.topicAnalytics = [];
    this.activityData = [];
    this.recommendations = [];
    this.analyticsError = undefined;

    // Read JWT token from AuthService
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadGroups();
    this.pollingHandle = window.setInterval(() => this.loadStats(), 30_000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pollingHandle) {
      window.clearInterval(this.pollingHandle);
      this.pollingHandle = undefined;
    }
    this.clearExportPolling();
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header class="page-header">
          <div class="header-title">
            <h1>
              ${this.selectedGroup
                ? `Группа ${this.selectedGroup.name}`
                : 'Teacher Dashboard'}
            </h1>
            ${this.lastUpdated
              ? html`<p class="muted">Обновлено ${this.lastUpdated}</p>`
              : html`<p class="muted">Данные обновляются каждые 30 секунд.</p>`}
          </div>
          <div class="header-controls">
            ${this.groupLoading
              ? html`<span class="muted">Загрузка групп...</span>`
              : this.renderGroupSelector()}
            <div class="header-buttons">
              <a class="action-link primary" href=${this.studentListUrl}>Ученики</a>
              <a class="action-link" href="/teacher/analytics">Аналитика</a>
              <a class="action-link" href="/teacher/reports">Отчёты</a>
              <a class="action-link" href="/teacher/notifications">Уведомления</a>
            </div>
          </div>
        </header>
        ${this.renderGroupMeta()} ${this.renderAnalyticsSection()} ${this.renderError()}
        ${this.renderMetrics()} ${this.renderLeaderboard()} ${this.renderExportForm()}
      </div>
    `;
  }

  private renderGroupSelector() {
    if (!this.groups.length) {
      return html`<span class="muted">Нет назначенных групп.</span>`;
    }
    return html`
      <label class="group-selector">
        <span>Группа</span>
        <select
          @change=${this.onGroupChange}
          .value=${this.groupId ?? ''}
          ?disabled=${this.groupLoading}
        >
          ${this.groups.map(
            (group) => html`<option value=${group.id}>${group.name}</option>`,
          )}
        </select>
      </label>
    `;
  }

  private renderGroupMeta() {
    if (!this.selectedGroup) {
      return null;
    }
    return html`
      <div class="group-meta">
        <div>
          <span>Школа</span>
          <strong>${this.selectedGroup.school}</strong>
        </div>
        <div>
          <span>Студентов</span>
          <strong>${this.selectedGroup.student_count}</strong>
        </div>
        <div>
          <span>Описание</span>
          <strong>${this.selectedGroup.description ?? '—'}</strong>
        </div>
      </div>
    `;
  }

  private renderAnalyticsSection() {
    if (!this.groupId) {
      return null;
    }

    return html`
      <section class="analytics-section">
        <h2>Аналитика</h2>
        ${this.analyticsLoading
          ? html`<p class="muted">Загрузка аналитики...</p>`
          : this.analyticsError
            ? html`<p class="muted">Ошибка: ${this.analyticsError}</p>`
            : html`
                <div class="analytics-grid">
                  <div>${this.renderTopicAnalytics()}</div>
                  <div>${this.renderActivityChart()}</div>
                  <div>${this.renderRecommendations()}</div>
                </div>
              `}
      </section>
    `;
  }

  private renderTopicAnalytics() {
    if (!this.topicAnalytics.length) {
      return html`<p class="muted">Нет доступной аналитики по темам.</p>`;
    }

    return html`
      <h3>Статистика по темам</h3>
      <table class="analytics-table">
        <thead>
          <tr>
            <th>Тема</th>
            <th>Точность</th>
            <th>Попытки</th>
            <th>Баллы</th>
          </tr>
        </thead>
        <tbody>
          ${this.topicAnalytics.slice(0, 6).map(
            (topic) => html`
              <tr>
                <td>${topic.topic_name ?? '—'}</td>
                <td>${this.formatPercent(topic.avg_percentage)}</td>
                <td>${topic.total_attempts ?? '—'}</td>
                <td>${topic.total_score ?? '—'}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  private renderActivityChart() {
    if (!this.activityData.length) {
      return html`<p class="muted">Активность пока недоступна.</p>`;
    }

    return html`
      <h3>График активности</h3>
      <div class="activity-chart">
        ${this.activityData.map((point) => {
          const percent = Math.max(0, Math.min(100, point.avg_percentage ?? 0));
          return html`
            <div class="activity-bar">
              <span class="bar">
                <span class="bar-fill" style="height: ${percent}%;"></span>
              </span>
              <small>${point.date}</small>
            </div>
          `;
        })}
      </div>
    `;
  }

  private renderRecommendations() {
    if (!this.recommendations.length) {
      return html`<p class="muted">Рекомендации пока не сформированы.</p>`;
    }

    return html`
      <h3>Рекомендации</h3>
      <div class="recommendation-list">
        ${this.recommendations.map(
          (rec) => html`
            <div class="recommendation">
              <strong>${rec.topic_name ?? 'Неизвестная тема'}</strong>
              <p class="muted">${this.formatPercent(rec.avg_percentage)}</p>
            </div>
          `,
        )}
      </div>
    `;
  }

  private formatPercent(value?: number) {
    return value != null ? `${value.toFixed(1)}%` : '—';
  }

  private get studentListUrl() {
    if (!this.groupId) {
      return '/teacher/students';
    }
    const params = new URLSearchParams();
    params.set('groupId', this.groupId);
    return `/teacher/students?${params.toString()}`;
  }

  private onGroupChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const value = select.value;
    if (value) {
      this.setGroupId(value, true);
    }
  }

  private setGroupId(groupId: string, syncUrl: boolean) {
    this.groupId = groupId;
    this.selectedGroup = this.groups.find((group) => group.id === groupId);
    if (syncUrl) {
      this.updateUrlGroupId(groupId);
    }
    this.loadStats();
    this.loadAnalytics();
  }

  private updateUrlGroupId(groupId: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('groupId', groupId);
    const basePath = window.location.pathname;
    const query = params.toString();
    const nextUrl = query ? `${basePath}?${query}` : basePath;
    window.history.replaceState({}, '', nextUrl);
  }

  private async loadGroups() {
    this.groupLoading = true;
    this.error = undefined;
    try {
      this.groups = await this.client.listTeacherGroups();
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('groupId');
      const candidate =
        requested && this.groups.some((group) => group.id === requested)
          ? requested
          : (this.groups[0]?.id ?? null);
      if (candidate) {
        this.setGroupId(candidate, requested !== candidate);
      }
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.groupLoading = false;
    }
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
      <div class="export-form" id="export-form">
        <div class="status">
          <span>Экспорт CSV/PDF/XLSX</span>
          ${this.exportMessage
            ? html`<span class="muted">${this.exportMessage}</span>`
            : null}
        </div>
        ${this.exportStatus
          ? html`
              <div class="status">
                <span>Текущий статус</span>
                <span>${this.formatExportStatus(this.exportStatus.status)}</span>
              </div>
            `
          : null}
        ${this.exportStatus?.download_url
          ? html`
              <a
                class="action-link primary download-link"
                href=${this.exportStatus.download_url}
                target="_blank"
                rel="noopener"
              >
                Скачать ${this.exportStatus.format.toUpperCase()}
              </a>
              <small class="muted">
                Ссылка активна до
                ${new Date(this.exportStatus.expires_at).toLocaleString()}
              </small>
            `
          : null}
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
                  | 'pdf'
                  | 'xlsx')}
            >
              <option value="csv" ?selected=${this.exportFormat === 'csv'}>CSV</option>
              <option value="pdf" ?selected=${this.exportFormat === 'pdf'}>PDF</option>
              <option value="xlsx" ?selected=${this.exportFormat === 'xlsx'}>XLSX</option>
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

  private async loadAnalytics() {
    if (!this.groupId) {
      this.topicAnalytics = [];
      this.activityData = [];
      this.recommendations = [];
      return;
    }
    this.analyticsLoading = true;
    this.analyticsError = undefined;
    try {
      const [topics, activity, recs] = await Promise.all([
        this.client.getGroupTopicAnalytics(this.groupId),
        this.client.getGroupActivity(this.groupId),
        this.client.getGroupRecommendations(this.groupId),
      ]);
      this.topicAnalytics = topics;
      this.activityData = activity;
      this.recommendations = recs;
    } catch (error) {
      this.analyticsError = (error as Error).message;
      this.topicAnalytics = [];
      this.activityData = [];
      this.recommendations = [];
    } finally {
      this.analyticsLoading = false;
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
      this.exportStatus = undefined;
      this.exportMessage = `Запрос ${response.export_id} отправлен. Ожидайте готовности.`;
      this.startExportPolling(response.export_id);
    } catch (error) {
      this.exportMessage = `Ошибка экспорта: ${(error as Error).message}`;
      this.clearExportPolling();
    }
  }

  private startExportPolling(exportId: string) {
    this.clearExportPolling();
    const poll = async () => {
      try {
        const status = await this.client.getExportStatus(exportId);
        this.exportStatus = status;
        if (status.download_url) {
          this.exportMessage = `Отчёт готов. Ссылка активна до ${new Date(
            status.expires_at,
          ).toLocaleString()}`;
          this.clearExportPolling();
          return;
        }
        if (status.status === 'failed') {
          this.exportMessage = status.error ?? 'Не удалось подготовить отчёт.';
          this.clearExportPolling();
          return;
        }
        this.exportMessage = `Статус экспорта: ${this.formatExportStatus(status.status)}`;
      } catch (error) {
        this.exportMessage = `Не удалось обновить статус: ${(error as Error).message}`;
        this.clearExportPolling();
        return;
      }
      this.exportPollTimer = window.setTimeout(poll, 5000);
    };
    void poll();
  }

  private clearExportPolling() {
    if (this.exportPollTimer) {
      window.clearTimeout(this.exportPollTimer);
      this.exportPollTimer = undefined;
    }
  }

  private formatExportStatus(status: ExportStatusPayload['status']) {
    switch (status) {
      case 'pending':
        return 'в очереди';
      case 'processing':
        return 'готовится';
      case 'ready':
        return 'готов';
      case 'failed':
        return 'ошибка';
      default:
        return status;
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
