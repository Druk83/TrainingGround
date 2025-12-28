import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type { AuditLogEntry, AuditLogQueryParams, AuditEventType } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

type SuccessFilter = 'all' | 'success' | 'failure';

interface AuditFilters {
  search: string;
  event_type: string;
  user_id: string;
  success: SuccessFilter;
  from: string;
  to: string;
}

const DEFAULT_FILTERS: AuditFilters = {
  search: '',
  event_type: '',
  user_id: '',
  success: 'all',
  from: '',
  to: '',
};

const EVENT_LABELS: Record<AuditEventType, string> = {
  login: 'Успешный вход',
  login_failed: 'Неуспешный вход',
  register: 'Регистрация',
  register_failed: 'Ошибка регистрации',
  logout: 'Выход',
  refresh_token: 'Обновление токена',
  refresh_token_failed: 'Ошибка обновления токена',
  change_password: 'Смена пароля',
  change_password_failed: 'Ошибка смены пароля',
  revoke_session: 'Завершение сессии',
  update_user: 'Обновление пользователя',
  access_denied: 'Доступ запрещен',
  create_user: 'Создание пользователя',
  delete_user: 'Удаление пользователя',
  block_user: 'Блокировка пользователя',
  unblock_user: 'Разблокировка пользователя',
  create_group: 'Создание группы',
  update_group: 'Обновление группы',
  delete_group: 'Удаление группы',
};

@customElement('audit-logs-page')
export class AuditLogsPage extends LitElement {
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
    }

    .page-header {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
      margin-bottom: var(--spacing-lg);
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

    .card {
      background: var(--surface-0);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      box-shadow: var(--shadow-sm);
      margin-bottom: var(--spacing-lg);
    }

    form.filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--spacing-md);
      align-items: flex-end;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    label {
      font-weight: 600;
      font-size: var(--font-sm);
      color: var(--text-muted);
    }

    input,
    select {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: var(--font-sm);
      font-family: inherit;
      background: white;
      transition: border-color 0.2s;
    }

    input:focus,
    select:focus {
      border-color: var(--primary);
      outline: none;
    }

    .filters-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
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

    button.secondary {
      background: var(--surface-2);
      color: var(--text-main);
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .table-wrapper {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-sm);
    }

    thead th {
      text-align: left;
      padding: var(--spacing-sm);
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    tbody td {
      padding: var(--spacing-md) var(--spacing-sm);
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
    }

    .meta {
      color: var(--text-muted);
      font-size: var(--font-xs);
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xxs);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-weight: 600;
      font-size: var(--font-xs);
    }

    .status-chip.success {
      background: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
    }

    .status-chip.failure {
      background: rgba(231, 76, 60, 0.15);
      color: #e74c3c;
    }

    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--spacing-md);
      flex-wrap: wrap;
      margin-bottom: var(--spacing-md);
    }

    .pagination {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      align-items: center;
      flex-wrap: wrap;
      margin-top: var(--spacing-md);
    }

    .info {
      color: var(--text-muted);
      font-size: var(--font-sm);
    }

    .empty-state {
      padding: var(--spacing-xl);
      text-align: center;
      color: var(--text-muted);
    }

    .error {
      color: #e74c3c;
      background: rgba(231, 76, 60, 0.1);
      border: 1px solid rgba(231, 76, 60, 0.2);
      border-radius: var(--radius-md);
      padding: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }

    .details {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .details span {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: var(--font-sm);
    }

    .log-id {
      font-size: var(--font-xs);
      color: var(--text-muted);
      word-break: break-all;
    }

    @media (max-width: 768px) {
      .actions-bar {
        flex-direction: column;
        align-items: stretch;
      }

      .pagination {
        justify-content: center;
      }
    }
  `;

  private apiClient: ApiClient;

  @state() declare private logs: AuditLogEntry[];
  @state() declare private loading: boolean;
  @state() declare private exporting: boolean;
  @state() declare private error?: string;
  @state() declare private filters: AuditFilters;
  @state() declare private page: number;
  @state() declare private pageSize: number;
  @state() declare private hasNextPage: boolean;

  constructor() {
    super();
    const token = authService.getToken();
    this.apiClient = new ApiClient({ jwt: token ?? undefined });
    this.logs = [];
    this.loading = false;
    this.exporting = false;
    this.error = undefined;
    this.filters = { ...DEFAULT_FILTERS };
    this.page = 1;
    this.pageSize = 25;
    this.hasNextPage = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.loadAuditLogs();
  }

  private async loadAuditLogs() {
    this.loading = true;
    this.error = undefined;

    const query: AuditLogQueryParams = {
      search: this.filters.search.trim() || undefined,
      event_type: (this.filters.event_type || undefined) as AuditEventType | undefined,
      user_id: this.filters.user_id.trim() || undefined,
      success:
        this.filters.success === 'all' ? undefined : this.filters.success === 'success',
      from: this.filters.from ? this.buildDateIso(this.filters.from) : undefined,
      to: this.filters.to ? this.buildDateIso(this.filters.to, true) : undefined,
      limit: this.pageSize,
      offset: (this.page - 1) * this.pageSize,
    };

    try {
      const logs = await this.apiClient.listAuditLogs(query);
      this.logs = logs;
      this.hasNextPage = logs.length === this.pageSize;
    } catch (error) {
      console.error('Failed to load audit logs', error);
      this.error = error instanceof Error ? error.message : 'Не удалось загрузить логи';
    } finally {
      this.loading = false;
    }
  }

  private buildDateIso(value: string, endOfDay = false) {
    const date = endOfDay
      ? new Date(`${value}T23:59:59.999Z`)
      : new Date(`${value}T00:00:00.000Z`);
    return date.toISOString();
  }

  private handleApplyFilters(event: Event) {
    event.preventDefault();
    this.page = 1;
    this.loadAuditLogs();
  }

  private handleResetFilters() {
    this.filters = { ...DEFAULT_FILTERS };
    this.page = 1;
    this.loadAuditLogs();
  }

  private updateFilter(field: keyof AuditFilters, value: string) {
    if (field === 'success') {
      this.filters = { ...this.filters, success: value as SuccessFilter };
    } else {
      this.filters = { ...this.filters, [field]: value };
    }
  }

  private changePage(delta: number) {
    const nextPage = this.page + delta;
    if (nextPage < 1) return;
    if (delta > 0 && !this.hasNextPage) return;
    this.page = nextPage;
    this.loadAuditLogs();
  }

  private async handleExport() {
    this.exporting = true;
    try {
      const query: AuditLogQueryParams = {
        search: this.filters.search.trim() || undefined,
        event_type: (this.filters.event_type || undefined) as AuditEventType | undefined,
        user_id: this.filters.user_id.trim() || undefined,
        success:
          this.filters.success === 'all' ? undefined : this.filters.success === 'success',
        from: this.filters.from ? this.buildDateIso(this.filters.from) : undefined,
        to: this.filters.to ? this.buildDateIso(this.filters.to, true) : undefined,
      };

      const blob = await this.apiClient.exportAuditLogs(query);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export audit logs', error);
      this.error =
        error instanceof Error ? error.message : 'Не удалось экспортировать CSV';
    } finally {
      this.exporting = false;
    }
  }

  private getEventLabel(eventType: AuditEventType) {
    return EVENT_LABELS[eventType] ?? eventType;
  }

  private formatDate(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  private getRangeLabel() {
    if (this.logs.length === 0) {
      return '0';
    }
    const start = (this.page - 1) * this.pageSize + 1;
    const end = (this.page - 1) * this.pageSize + this.logs.length;
    return `${start}–${end}`;
  }

  private renderStatus(log: AuditLogEntry) {
    return html`
      <span class="status-chip ${log.success ? 'success' : 'failure'}">
        ${log.success ? 'Успех' : 'Ошибка'}
      </span>
      ${log.error_message
        ? html`<div class="meta">Ошибка: ${log.error_message}</div>`
        : null}
    `;
  }

  render() {
    return html`
      <app-header></app-header>
      <main>
        <section class="page-header">
          <div class="page-title">Аудит и логи</div>
          <div class="page-subtitle">
            Просматривайте действия администраторов и критические события системы
          </div>
        </section>

        <section class="card">
          <form class="filters" @submit=${this.handleApplyFilters}>
            <div class="field">
              <label for="search">Поиск по email или деталям</label>
              <input
                id="search"
                type="text"
                placeholder="Например, user@example.com"
                .value=${this.filters.search}
                @input=${(e: Event) =>
                  this.updateFilter('search', (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <label for="event">Тип события</label>
              <select
                id="event"
                .value=${this.filters.event_type}
                @change=${(e: Event) =>
                  this.updateFilter('event_type', (e.target as HTMLSelectElement).value)}
              >
                <option value="">Все события</option>
                ${Object.entries(EVENT_LABELS).map(
                  ([value, label]) => html`
                    <option value=${value} ?selected=${this.filters.event_type === value}>
                      ${label}
                    </option>
                  `,
                )}
              </select>
            </div>

            <div class="field">
              <label for="result">Результат</label>
              <select
                id="result"
                .value=${this.filters.success}
                @change=${(e: Event) =>
                  this.updateFilter('success', (e.target as HTMLSelectElement).value)}
              >
                <option value="all">Все</option>
                <option value="success">Успешно</option>
                <option value="failure">Ошибка</option>
              </select>
            </div>

            <div class="field">
              <label for="user">ID пользователя</label>
              <input
                id="user"
                type="text"
                placeholder="Например, 64ab..."
                .value=${this.filters.user_id}
                @input=${(e: Event) =>
                  this.updateFilter('user_id', (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <label for="from">Дата от</label>
              <input
                id="from"
                type="date"
                .value=${this.filters.from}
                @input=${(e: Event) =>
                  this.updateFilter('from', (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <label for="to">Дата до</label>
              <input
                id="to"
                type="date"
                .value=${this.filters.to}
                @input=${(e: Event) =>
                  this.updateFilter('to', (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="filters-actions">
              <button type="button" class="secondary" @click=${this.handleResetFilters}>
                Сбросить
              </button>
              <button type="submit" class="primary" ?disabled=${this.loading}>
                Применить
              </button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="actions-bar">
            <div class="info">
              ${this.loading
                ? 'Обновляем список...'
                : this.logs.length > 0
                  ? html`Показаны события ${this.getRangeLabel()}`
                  : 'Нет данных для отображения'}
            </div>
            <div class="actions">
              <select
                .value=${String(this.pageSize)}
                @change=${(e: Event) => {
                  const value = Number((e.target as HTMLSelectElement).value);
                  this.pageSize = value;
                  this.page = 1;
                  this.loadAuditLogs();
                }}
              >
                <option value="25">25 на странице</option>
                <option value="50">50 на странице</option>
                <option value="100">100 на странице</option>
              </select>
              <button
                class="secondary"
                @click=${this.handleExport}
                ?disabled=${this.exporting || this.loading}
              >
                ${this.exporting ? 'Экспорт...' : 'Экспорт CSV'}
              </button>
            </div>
          </div>

          ${this.error ? html`<div class="error">${this.error}</div>` : null}
          ${this.loading
            ? html`<div class="empty-state">Загружаем аудит-логи...</div>`
            : this.logs.length === 0
              ? html`<div class="empty-state">Нет записей по заданным фильтрам</div>`
              : html`
                  <div class="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Дата / ID</th>
                          <th>Событие</th>
                          <th>Пользователь</th>
                          <th>IP / User Agent</th>
                          <th>Результат</th>
                          <th>Детали</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.logs.map(
                          (log) => html`
                            <tr>
                              <td>
                                <div>${this.formatDate(log.createdAt)}</div>
                                <div class="log-id">${log.id ?? '—'}</div>
                              </td>
                              <td>
                                <div>${this.getEventLabel(log.event_type)}</div>
                                <div class="meta">${log.event_type}</div>
                              </td>
                              <td>
                                ${log.email ?? '—'}
                                ${log.user_id
                                  ? html`<div class="meta">ID: ${log.user_id}</div>`
                                  : null}
                              </td>
                              <td>
                                <div>${log.ip ?? '—'}</div>
                                ${log.user_agent
                                  ? html`<div class="meta">${log.user_agent}</div>`
                                  : null}
                              </td>
                              <td>${this.renderStatus(log)}</td>
                              <td>
                                <div class="details">
                                  ${log.details ? html`<span>${log.details}</span>` : '—'}
                                </div>
                              </td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                `}

          <div class="pagination">
            <button
              class="secondary"
              ?disabled=${this.loading || this.page === 1}
              @click=${() => this.changePage(-1)}
            >
              Назад
            </button>
            <span>Страница ${this.page}</span>
            <button
              class="secondary"
              ?disabled=${this.loading || !this.hasNextPage}
              @click=${() => this.changePage(1)}
            >
              Вперед
            </button>
          </div>
        </section>
      </main>
    `;
  }
}
