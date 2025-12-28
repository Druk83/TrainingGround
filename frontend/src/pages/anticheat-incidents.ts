import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type {
  IncidentResolutionAction,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  IncidentWithUser,
  ListIncidentsQuery,
} from '@/lib/api-types';
import { authService } from '@/lib/auth-service';
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

type FilterState = {
  incident_type: string;
  severity: string;
  status: string;
  user_id: string;
};

type Notice = {
  type: 'success' | 'error';
  message: string;
};

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  speed_violation: 'Speed Hack',
  repeated_answers: 'Повторяющиеся ответы',
  suspicious_pattern: 'Подозрительные действия',
};

const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  critical: 'Критическая',
};

const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Открыт',
  resolved: 'Решен',
  false_positive: 'Ложное срабатывание',
};

@customElement('anticheat-incidents-page')
export class AnticheatIncidentsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
    }

    main {
      max-width: var(--container-xl);
      margin: 0 auto;
      padding: var(--spacing-xl) var(--spacing-md) var(--spacing-xxl);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .page-header {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .page-title {
      font-size: var(--font-2xl);
      font-weight: 700;
      color: var(--text-main);
    }

    .page-subtitle {
      color: var(--text-muted);
      font-size: var(--font-md);
    }

    .grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: var(--spacing-lg);
    }

    .card {
      background: var(--surface-0);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      box-shadow: var(--shadow-sm);
    }

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    label {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xxs);
      font-size: var(--font-sm);
      color: var(--text-muted);
      font-weight: 600;
    }

    input,
    select,
    textarea {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: var(--font-sm);
      font-family: inherit;
      transition: border-color 0.2s;
      background: white;
    }

    textarea {
      min-height: 80px;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--primary);
      outline: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-sm);
    }

    th {
      text-align: left;
      padding: var(--spacing-sm);
      border-bottom: 1px solid var(--border-color);
      color: var(--text-muted);
      font-weight: 600;
    }

    td {
      padding: var(--spacing-md) var(--spacing-sm);
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
    }

    tbody tr {
      cursor: pointer;
      transition: background 0.2s;
    }

    tbody tr:hover {
      background: var(--surface-2);
    }

    tbody tr.selected {
      background: rgba(106, 17, 203, 0.08);
    }

    .status-chip,
    .severity-chip {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xxs);
      padding: 2px 10px;
      border-radius: var(--radius-full);
      font-weight: 600;
      font-size: var(--font-xs);
    }

    .severity-chip.medium {
      background: rgba(255, 165, 0, 0.2);
      color: #e67e22;
    }

    .severity-chip.high {
      background: rgba(231, 76, 60, 0.2);
      color: #e74c3c;
    }

    .severity-chip.critical {
      background: rgba(115, 0, 0, 0.2);
      color: #9b1b1b;
    }

    .severity-chip.low {
      background: rgba(52, 152, 219, 0.2);
      color: #2980b9;
    }

    .status-chip.open {
      background: rgba(236, 240, 241, 0.6);
      color: #7f8c8d;
    }

    .status-chip.resolved {
      background: rgba(46, 204, 113, 0.2);
      color: #27ae60;
    }

    .status-chip.false_positive {
      background: rgba(241, 196, 15, 0.2);
      color: #b9770e;
    }

    .actions {
      display: flex;
      gap: var(--spacing-sm);
      flex-wrap: wrap;
    }

    button {
      border: none;
      border-radius: var(--radius-md);
      padding: var(--spacing-sm) var(--spacing-lg);
      font-size: var(--font-sm);
      font-weight: 600;
      cursor: pointer;
      transition:
        background 0.2s,
        opacity 0.2s;
      font-family: inherit;
    }

    button.primary {
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      color: white;
    }

    button.ghost {
      background: transparent;
      border: 1px dashed var(--border-color);
      color: var(--text-muted);
    }

    button.secondary {
      background: var(--surface-2);
      color: var(--text-main);
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: var(--spacing-md);
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .detail-header {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
      margin-bottom: var(--spacing-md);
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }

    .detail-item {
      background: var(--surface-2);
      border-radius: var(--radius-md);
      padding: var(--spacing-sm);
    }

    .detail-item span {
      display: block;
      font-size: var(--font-xs);
      color: var(--text-muted);
    }

    .detail-item strong {
      display: block;
      font-size: var(--font-md);
      color: var(--text-main);
    }

    .histogram {
      display: flex;
      align-items: flex-end;
      gap: var(--spacing-md);
      height: 140px;
      margin: var(--spacing-md) 0;
    }

    .histogram-bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-xxs);
    }

    .histogram-bar-fill {
      width: 100%;
      background: linear-gradient(180deg, var(--primary), #764ba2);
      border-radius: var(--radius-md) var(--radius-md) 4px 4px;
      transition: height 0.3s;
    }

    .notice {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      border: 1px solid transparent;
      font-size: var(--font-sm);
    }

    .notice.success {
      background: rgba(46, 204, 113, 0.12);
      border-color: rgba(46, 204, 113, 0.4);
      color: #196f3d;
    }

    .notice.error {
      background: rgba(231, 76, 60, 0.12);
      border-color: rgba(231, 76, 60, 0.4);
      color: #922b21;
    }

    .empty-state {
      padding: var(--spacing-xl);
      text-align: center;
      color: var(--text-muted);
    }

    @media (max-width: 1024px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  private client: ApiClient;

  @state() declare private incidents: IncidentWithUser[];
  @state() declare private loading: boolean;
  @state() declare private error?: string;
  @state() declare private filters: FilterState;
  @state() declare private page: number;
  @state() declare private pageSize: number;
  @state() declare private hasNextPage: boolean;
  @state() declare private selectedIncident?: IncidentWithUser;
  @state() declare private resolutionNote: string;
  @state() declare private actionLoading: 'resolve' | 'false_positive' | 'unblock' | null;
  @state() declare private notice?: Notice;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
    this.incidents = [];
    this.loading = false;
    this.error = undefined;
    this.filters = {
      incident_type: '',
      severity: '',
      status: '',
      user_id: '',
    };
    this.page = 1;
    this.pageSize = 25;
    this.hasNextPage = false;
    this.selectedIncident = undefined;
    this.resolutionNote = '';
    this.actionLoading = null;
    this.notice = undefined;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.loadIncidents();
  }

  private async loadIncidents() {
    this.loading = true;
    this.error = undefined;

    const query: ListIncidentsQuery = {
      incident_type: (this.filters.incident_type || undefined) as
        | IncidentType
        | undefined,
      severity: (this.filters.severity || undefined) as IncidentSeverity | undefined,
      status: (this.filters.status || undefined) as IncidentStatus | undefined,
      user_id: this.filters.user_id.trim() || undefined,
      limit: this.pageSize,
      offset: (this.page - 1) * this.pageSize,
    };

    try {
      const records = await this.client.listIncidents(query);
      this.incidents = records;
      this.hasNextPage = records.length === this.pageSize;
      if (records.length > 0) {
        const existingId = this.selectedIncident?.incident.id;
        const matched =
          records.find((record) => record.incident.id === existingId) ?? records[0];
        this.selectIncident(matched);
      } else {
        this.selectedIncident = undefined;
        this.resolutionNote = '';
      }
    } catch (error) {
      console.error('Failed to load incidents', error);
      this.error =
        error instanceof Error ? error.message : 'Не удалось загрузить инциденты';
    } finally {
      this.loading = false;
    }
  }

  private selectIncident(incident: IncidentWithUser) {
    this.selectedIncident = incident;
    this.resolutionNote = incident.incident.resolution_note ?? '';
  }

  private updateFilter(field: keyof FilterState, value: string) {
    this.filters = { ...this.filters, [field]: value };
  }

  private applyFilters(event: Event) {
    event.preventDefault();
    this.page = 1;
    this.loadIncidents();
  }

  private resetFilters() {
    this.filters = {
      incident_type: '',
      severity: '',
      status: '',
      user_id: '',
    };
    this.page = 1;
    this.loadIncidents();
  }

  private changePage(delta: number) {
    const nextPage = this.page + delta;
    if (nextPage < 1) return;
    if (delta > 0 && !this.hasNextPage) return;
    this.page = nextPage;
    this.loadIncidents();
  }

  private async handleResolution(action: IncidentResolutionAction) {
    if (!this.selectedIncident) return;
    this.actionLoading = action;
    this.notice = undefined;

    try {
      const updated = await this.client.updateIncident(
        this.selectedIncident.incident.id,
        {
          action,
          note: this.resolutionNote.trim() || undefined,
        },
      );

      this.incidents = this.incidents.map((record) =>
        record.incident.id === updated.incident.id ? updated : record,
      );
      this.selectIncident(updated);
      this.notice = {
        type: 'success',
        message:
          action === 'resolve'
            ? 'Инцидент отмечен как решенный'
            : 'Инцидент отмечен как ложное срабатывание',
      };
    } catch (error) {
      console.error('Failed to update incident', error);
      this.notice = {
        type: 'error',
        message: error instanceof Error ? error.message : 'Не удалось обновить инцидент',
      };
    } finally {
      this.actionLoading = null;
    }
  }

  private async handleUnblock() {
    if (!this.selectedIncident) return;
    if (!this.selectedIncident.user || !this.selectedIncident.user.is_blocked) return;
    this.actionLoading = 'unblock';
    this.notice = undefined;

    try {
      const user = await this.client.unblockIncidentUser(
        this.selectedIncident.incident.id,
      );
      const updated: IncidentWithUser = {
        ...this.selectedIncident,
        user: this.selectedIncident.user
          ? { ...this.selectedIncident.user, is_blocked: user.is_blocked }
          : undefined,
      };
      this.incidents = this.incidents.map((record) =>
        record.incident.id === updated.incident.id ? updated : record,
      );
      this.selectIncident(updated);
      this.notice = {
        type: 'success',
        message: 'Пользователь успешно разблокирован',
      };
    } catch (error) {
      console.error('Failed to unblock user', error);
      this.notice = {
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось разблокировать пользователя',
      };
    } finally {
      this.actionLoading = null;
    }
  }

  private renderSeverityChip(severity: IncidentSeverity) {
    return html`
      <span class="severity-chip ${severity}">
        ${INCIDENT_SEVERITY_LABELS[severity]}
      </span>
    `;
  }

  private renderStatusChip(status: IncidentStatus) {
    return html`
      <span class="status-chip ${status}"> ${INCIDENT_STATUS_LABELS[status]} </span>
    `;
  }

  private formatDate(value: string) {
    return new Date(value).toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  private renderHistogram() {
    if (!this.selectedIncident) return null;
    const details = this.selectedIncident.incident.details;
    const buckets = [
      { label: 'Скорость', value: details.speed_hits ?? 0 },
      { label: 'Повторы', value: details.repeated_hits ?? 0 },
      { label: 'Окно, c', value: details.time_window_seconds ?? 0 },
    ];
    const maxValue = Math.max(...buckets.map((bucket) => bucket.value), 1);

    if (maxValue === 0) {
      return html`<div class="empty-state">Нет телеметрии для построения графика</div>`;
    }

    return html`
      <div class="histogram" role="img" aria-label="Гистограмма показателей инцидента">
        ${buckets.map(
          (bucket) => html`
            <div class="histogram-bar">
              <div
                class="histogram-bar-fill"
                style="height: ${(bucket.value / maxValue) * 100}%"
              ></div>
              <span>${bucket.label}</span>
              <small>${bucket.value}</small>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderIncidentsTable() {
    if (this.loading) {
      return html`<div class="empty-state">Загружаем инциденты...</div>`;
    }

    if (this.error) {
      return html`<div class="notice error">${this.error}</div>`;
    }

    if (this.incidents.length === 0) {
      return html`<div class="empty-state">Инциденты не найдены</div>`;
    }

    return html`
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Инцидент</th>
              <th>Пользователь</th>
              <th>Серьезность</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${this.incidents.map(
              (record) => html`
                <tr
                  class=${this.selectedIncident?.incident.id === record.incident.id
                    ? 'selected'
                    : ''}
                  @click=${() => this.selectIncident(record)}
                >
                  <td>
                    <div>${INCIDENT_TYPE_LABELS[record.incident.incident_type]}</div>
                    <div class="meta">${this.formatDate(record.incident.timestamp)}</div>
                  </td>
                  <td>
                    <div>${record.user?.name ?? 'Неизвестно'}</div>
                    <div class="meta">${record.user?.email ?? '—'}</div>
                  </td>
                  <td>${this.renderSeverityChip(record.incident.severity)}</td>
                  <td>${this.renderStatusChip(record.incident.status)}</td>
                  <td>
                    <div class="actions">
                      <button
                        class="ghost"
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          this.selectIncident(record);
                        }}
                      >
                        Подробнее
                      </button>
                    </div>
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderDetailPanel() {
    if (!this.selectedIncident) {
      return html`<div class="empty-state">Выберите инцидент из списка слева</div>`;
    }

    const incident = this.selectedIncident.incident;
    const user = this.selectedIncident.user;

    return html`
      <div class="detail-header">
        <h2>${INCIDENT_TYPE_LABELS[incident.incident_type]}</h2>
        <div>
          ${this.renderSeverityChip(incident.severity)}
          ${this.renderStatusChip(incident.status)}
        </div>
        <div class="meta">Обнаружено: ${this.formatDate(incident.timestamp)}</div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span>Email</span>
          <strong>${user?.email ?? '—'}</strong>
        </div>
        <div class="detail-item">
          <span>ФИО</span>
          <strong>${user?.name ?? '—'}</strong>
        </div>
        <div class="detail-item">
          <span>Действие системы</span>
          <strong>${incident.action_taken}</strong>
        </div>
        <div class="detail-item">
          <span>Блокировка</span>
          <strong>${user?.is_blocked ? 'Активна' : 'Нет'}</strong>
        </div>
      </div>

      <section>
        <h3>Детали телеметрии</h3>
        ${this.renderHistogram()}
        <div class="detail-grid">
          <div class="detail-item">
            <span>Speed hits</span>
            <strong>${incident.details.speed_hits ?? 0}</strong>
          </div>
          <div class="detail-item">
            <span>Повторения</span>
            <strong>${incident.details.repeated_hits ?? 0}</strong>
          </div>
          <div class="detail-item">
            <span>Окно (сек)</span>
            <strong>${incident.details.time_window_seconds ?? 0}</strong>
          </div>
        </div>
        ${incident.details.additional_info
          ? html`<p class="meta">${incident.details.additional_info}</p>`
          : null}
      </section>

      <section>
        <h3>Комментарий</h3>
        <textarea
          .value=${this.resolutionNote}
          placeholder="Добавьте примечание к инциденту"
          @input=${(event: Event) =>
            (this.resolutionNote = (event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </section>

      <section class="actions">
        <button
          class="primary"
          ?disabled=${this.actionLoading === 'resolve'}
          @click=${() => this.handleResolution('resolve')}
        >
          ${this.actionLoading === 'resolve' ? 'Сохранение...' : 'Отметить как решено'}
        </button>
        <button
          class="secondary"
          ?disabled=${this.actionLoading === 'false_positive'}
          @click=${() => this.handleResolution('false_positive')}
        >
          ${this.actionLoading === 'false_positive'
            ? 'Сохранение...'
            : 'Ложное срабатывание'}
        </button>
        <button
          class="ghost"
          ?disabled=${!user?.is_blocked || this.actionLoading === 'unblock'}
          @click=${this.handleUnblock}
        >
          ${this.actionLoading === 'unblock' ? 'Разблокировка...' : 'Разблокировать'}
        </button>
      </section>
    `;
  }

  render() {
    return html`
      <app-header></app-header>
      <main>
        <section class="page-header">
          <div class="page-title">Инциденты античита</div>
          <div class="page-subtitle">
            Следите за подозрительной активностью и оперативно реагируйте на угрозы
          </div>
        </section>

        <section class="card">
          <form class="filters" @submit=${this.applyFilters}>
            <label>
              Тип инцидента
              <select
                .value=${this.filters.incident_type}
                @change=${(e: Event) =>
                  this.updateFilter(
                    'incident_type',
                    (e.target as HTMLSelectElement).value,
                  )}
              >
                <option value="">Все</option>
                ${Object.entries(INCIDENT_TYPE_LABELS).map(
                  ([value, label]) => html`
                    <option
                      value=${value}
                      ?selected=${this.filters.incident_type === value}
                    >
                      ${label}
                    </option>
                  `,
                )}
              </select>
            </label>

            <label>
              Серьезность
              <select
                .value=${this.filters.severity}
                @change=${(e: Event) =>
                  this.updateFilter('severity', (e.target as HTMLSelectElement).value)}
              >
                <option value="">Все</option>
                ${Object.entries(INCIDENT_SEVERITY_LABELS).map(
                  ([value, label]) => html`
                    <option value=${value} ?selected=${this.filters.severity === value}>
                      ${label}
                    </option>
                  `,
                )}
              </select>
            </label>

            <label>
              Статус
              <select
                .value=${this.filters.status}
                @change=${(e: Event) =>
                  this.updateFilter('status', (e.target as HTMLSelectElement).value)}
              >
                <option value="">Все</option>
                ${Object.entries(INCIDENT_STATUS_LABELS).map(
                  ([value, label]) => html`
                    <option value=${value} ?selected=${this.filters.status === value}>
                      ${label}
                    </option>
                  `,
                )}
              </select>
            </label>

            <label>
              ID пользователя
              <input
                type="text"
                placeholder="Например, 64af..."
                .value=${this.filters.user_id}
                @input=${(e: Event) =>
                  this.updateFilter('user_id', (e.target as HTMLInputElement).value)}
              />
            </label>

            <div class="actions">
              <button type="button" class="secondary" @click=${this.resetFilters}>
                Сбросить
              </button>
              <button type="submit" class="primary" ?disabled=${this.loading}>
                Применить фильтры
              </button>
            </div>
          </form>
        </section>

        <div class="grid">
          <section class="card">
            <header class="pagination">
              <div class="info">
                ${this.loading
                  ? 'Обновляем данные...'
                  : `Найдено ${this.incidents.length} инцидентов`}
              </div>
              <div class="actions">
                <button class="secondary" @click=${() => this.loadIncidents()}>
                  Обновить
                </button>
                <select
                  .value=${String(this.pageSize)}
                  @change=${(e: Event) => {
                    const value = Number((e.target as HTMLSelectElement).value);
                    this.pageSize = value;
                    this.page = 1;
                    this.loadIncidents();
                  }}
                >
                  <option value="25">25 на странице</option>
                  <option value="50">50 на странице</option>
                  <option value="100">100 на странице</option>
                </select>
              </div>
            </header>

            ${this.renderIncidentsTable()}

            <div class="pagination">
              <button
                class="secondary"
                ?disabled=${this.page === 1 || this.loading}
                @click=${() => this.changePage(-1)}
              >
                Назад
              </button>
              <span>Страница ${this.page}</span>
              <button
                class="secondary"
                ?disabled=${!this.hasNextPage || this.loading}
                @click=${() => this.changePage(1)}
              >
                Вперед
              </button>
            </div>
          </section>

          <section class="card">
            ${this.notice
              ? html`<div class="notice ${this.notice.type}">${this.notice.message}</div>`
              : null}
            ${this.renderDetailPanel()}
          </section>
        </div>
      </main>
    `;
  }
}
