import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type { TopicAnalyticsEntry } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

@customElement('teacher-analytics')
export class TeacherAnalyticsPage extends LitElement {
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

    .muted {
      color: var(--text-muted);
      margin: 0.25rem 0 0;
    }

    .controls {
      display: flex;
      gap: 0.75rem;
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
      cursor: pointer;
      user-select: none;
    }

    th:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .topic-name {
      font-weight: 600;
      color: var(--primary);
      cursor: pointer;
      text-decoration: none;
    }

    .topic-name:hover {
      text-decoration: underline;
    }

    .percentage {
      font-variant-numeric: tabular-nums;
    }

    .metric-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: var(--radius-small);
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.85rem;
    }

    .metric-badge.good {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
    }

    .metric-badge.warning {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }

    .metric-badge.bad {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-medium);
    }

    .error {
      padding: 1rem;
      border-radius: var(--radius-medium);
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid rgba(244, 67, 54, 0.3);
      color: #ff5252;
    }

    @media (max-width: 720px) {
      .page {
        padding: 1rem;
      }

      th,
      td {
        padding: 0.5rem;
        font-size: 0.85rem;
      }
    }
  `;

  @state() private groupId: string | null = null;
  @state() private topics: TopicAnalyticsEntry[] = [];
  @state() private loading = false;
  @state() private error?: string;
  @state() private sortBy: keyof TopicAnalyticsEntry = 'topic_name';
  @state() private sortDesc = false;

  private client: ApiClient;

  constructor() {
    super();
    const params = new URLSearchParams(window.location.search);
    this.groupId = params.get('groupId');
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.groupId) {
      this.loadAnalytics();
    }
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header>
          <div>
            <h1>Аналитика по темам</h1>
            <p class="muted">Детальная статистика прохождения по всем темам группы.</p>
          </div>
          <div class="controls">
            <a class="action-link" href="/teacher-dashboard">← Назад</a>
          </div>
        </header>

        ${this.error ? html`<div class="error">Ошибка: ${this.error}</div>` : null}
        ${this.loading
          ? html`<div class="empty">Загрузка аналитики...</div>`
          : this.topics.length > 0
            ? this.renderTable()
            : html`<div class="empty">Нет данных по темам</div>`}
      </div>
    `;
  }

  private renderTable() {
    const sorted = this.sortTopics();

    return html`
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th @click=${() => this.toggleSort('topic_name')}>
                Тема ${this.sortIndicator('topic_name')}
              </th>
              <th @click=${() => this.toggleSort('total_attempts')}>
                Попыток ${this.sortIndicator('total_attempts')}
              </th>
              <th @click=${() => this.toggleSort('total_score')}>
                Баллы ${this.sortIndicator('total_score')}
              </th>
              <th @click=${() => this.toggleSort('avg_percentage')}>
                Точность ${this.sortIndicator('avg_percentage')}
              </th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(
              (topic) => html`
                <tr>
                  <td>
                    <a class="topic-name" href="#detail">${topic.topic_name ?? '—'}</a>
                  </td>
                  <td>${topic.total_attempts ?? '—'}</td>
                  <td>${topic.total_score ?? '—'}</td>
                  <td>
                    <span class="percentage"
                      >${this.formatMetric(topic.avg_percentage)}</span
                    >
                    ${this.getMetricBadge(topic.avg_percentage)}
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private sortTopics(): TopicAnalyticsEntry[] {
    const sorted = [...this.topics];
    sorted.sort((a, b) => {
      const aVal = a[this.sortBy];
      const bVal = b[this.sortBy];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      }

      return this.sortDesc ? -cmp : cmp;
    });

    return sorted;
  }

  private toggleSort(key: keyof TopicAnalyticsEntry) {
    if (this.sortBy === key) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortBy = key;
      this.sortDesc = false;
    }
  }

  private sortIndicator(key: keyof TopicAnalyticsEntry): string {
    if (this.sortBy !== key) return '';
    return this.sortDesc ? ' ↓' : ' ↑';
  }

  private formatMetric(value?: number): string {
    return value != null ? `${value.toFixed(1)}%` : '—';
  }

  private getMetricBadge(value?: number) {
    if (value == null) return null;
    let cssClass = 'metric-badge';
    if (value >= 80) cssClass += ' good';
    else if (value >= 60) cssClass += ' warning';
    else cssClass += ' bad';

    return html`<span class="${cssClass}">${value.toFixed(0)}%</span>`;
  }

  private async loadAnalytics() {
    if (!this.groupId) return;

    this.loading = true;
    this.error = undefined;

    try {
      this.topics = await this.client.getGroupTopicAnalytics(this.groupId);
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }
}
