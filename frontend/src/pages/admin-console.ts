import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  AdminTemplateSummary,
  QueueStatus,
  FeatureFlagRecord,
  TemplateFilterParams,
  TemplateRevertPayload,
  SystemMetrics,
  BackupRecord,
} from '@/lib/api-types';
import '@/components/app-header';

@customElement('admin-console')
export class AdminConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--surface-1);
      min-height: 100vh;
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
      padding: 2rem;
    }

    h1 {
      margin: 0 0 0.25rem;
      font-size: clamp(1.5rem, 3vw, 2.5rem);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .metrics-card {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      margin-bottom: 1.5rem;
    }

    .metrics-card h2 {
      margin: 0 0 1rem;
      font-size: 1.25rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .metric {
      padding: 1rem;
      border-radius: var(--radius-large);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .metric-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 600;
    }

    .metric-sub {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .filters {
      margin: 1.5rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .notice {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-large);
      border: 1px solid transparent;
      background: rgba(79, 70, 229, 0.1);
      color: var(--text-main);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .notice.success {
      border-color: rgba(34, 197, 94, 0.6);
      background: rgba(34, 197, 94, 0.15);
    }

    .notice.error {
      border-color: rgba(239, 68, 68, 0.6);
      background: rgba(239, 68, 68, 0.15);
    }

    .notice button {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 1rem;
    }

    label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    input,
    select {
      width: 100%;
      border-radius: var(--radius-medium);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--surface-2);
      padding: 0.55rem 0.75rem;
      color: var(--text-main);
      font-size: 1rem;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: 1.5rem;
    }

    .templates-card,
    .sidebar-card {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.25rem;
      box-shadow: var(--shadow-soft);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th,
    td {
      text-align: left;
      padding: 0.5rem;
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.02);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    button {
      border: none;
      border-radius: var(--radius-small);
      padding: 0.35rem 0.75rem;
      cursor: pointer;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: var(--primary);
      color: #fff;
      transition:
        transform 0.2s ease,
        opacity 0.2s ease;
    }

    button.secondary {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-main);
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-main);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status-pill {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.5rem;
      border-radius: 999px;
    }

    .row-meta {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .sidebar-card + .sidebar-card {
      margin-top: 1rem;
    }

    .queue-info,
    .flag-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .flag {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      align-items: center;
    }

    .flag h4 {
      margin: 0;
      font-size: 0.9rem;
    }

    .error {
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: var(--radius-medium);
      background: #ff4d4f;
      color: #fff;
    }
  `;

  private client: ApiClient;
  @state() declare private templates: AdminTemplateSummary[];
  @state() declare private queue?: QueueStatus;
  @state() declare private featureFlags: FeatureFlagRecord[];
  @state() declare private systemMetrics?: SystemMetrics;
  @state() declare private metricsUpdatedAt?: string;
  @state() declare private backups: BackupRecord[] | null;
  @state() declare private creatingBackup: boolean;
  @state() declare private restoringBackupId: string | null;
  @state() declare private loading: boolean;
  @state() declare private error?: string;
  @state() declare private filter: TemplateFilterParams;
  @state() declare private notice: { message: string; type: 'success' | 'error' } | null;
  private readonly isSystemAdmin: boolean;

  constructor() {
    super();
    // Initialize state properties
    this.templates = [];
    this.featureFlags = [];
    this.loading = false;
    this.filter = {};
    this.systemMetrics = undefined;
    this.metricsUpdatedAt = undefined;
    this.backups = null;
    this.creatingBackup = false;
    this.restoringBackupId = null;
    this.notice = null;
    this.isSystemAdmin = authService.getUser()?.role === 'admin';

    // Read JWT token from AuthService
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.refreshData();
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="header">
        <div>
          <h1>Админка: шаблоны и эмбеддинги</h1>
          <p class="row-meta">
            Жизненный цикл, workflow и очередь <code>content:changes</code> в одном месте.
          </p>
        </div>
        <div>${this.loading ? html`<span>Обновляется...</span>` : null}</div>
      </div>
      ${this.error ? html`<div class="error">${this.error}</div>` : null}
      ${this.notice
        ? html`
            <div class="notice ${this.notice.type}">
              <span>${this.notice.message}</span>
              <button
                type="button"
                aria-label="Закрыть уведомление"
                @click=${() => {
                  this.notice = null;
                }}
              >
                &times;
              </button>
            </div>
          `
        : null}
      ${this.isSystemAdmin ? this.renderSystemMetricsSection() : null}
      <div class="filters">
        <label>
          Поиск
          <input
            type="search"
            placeholder="slug / описание"
            @input=${(event: Event) =>
              this.applyFilterChange(
                'q',
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>
        <label>
          Статус
          <select
            @change=${(event: Event) =>
              this.applyFilterChange(
                'status',
                (event.currentTarget as HTMLSelectElement).value,
              )}
          >
            <option value="">Все</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="published">Published</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
        <label>
          Сложность
          <input
            type="text"
            placeholder="A1 / B2"
            @input=${(event: Event) =>
              this.applyFilterChange(
                'difficulty',
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>
        <label>
          Предел (limit)
          <input
            type="number"
            min="1"
            placeholder="25"
            @input=${(event: Event) =>
              this.applyFilterChange(
                'limit',
                Number((event.currentTarget as HTMLInputElement).value || undefined),
              )}
          />
        </label>
      </div>
      <div class="grid">
        <div class="templates-card">${this.renderTemplatesTable()}</div>
        <div>
          <div class="sidebar-card">${this.renderQueueCard()}</div>
          <div class="sidebar-card">${this.renderFeatureFlagsCard()}</div>
          ${this.renderBackupsSection()}
        </div>
      </div>
    `;
  }

  private showNotice(message: string, type: 'success' | 'error' = 'success') {
    this.notice = { message, type };
    window.setTimeout(() => {
      this.notice = null;
    }, 5000);
  }

  private renderSystemMetricsSection() {
    if (!this.systemMetrics) {
      return html`
        <section class="metrics-card">
          <h2>Состояние системы</h2>
          <p class="row-meta">Загружаем метрики...</p>
        </section>
      `;
    }

    const metrics = this.systemMetrics;
    const cards = [
      {
        label: 'Пользователи',
        value: metrics.total_users.toLocaleString('ru-RU'),
        sub: `${metrics.blocked_users.toLocaleString('ru-RU')} заблокировано`,
      },
      {
        label: 'Группы',
        value: metrics.total_groups.toLocaleString('ru-RU'),
        sub: `${metrics.total_incidents.toLocaleString('ru-RU')} инцидентов всего`,
      },
      {
        label: 'Открытые инциденты',
        value: metrics.open_incidents.toLocaleString('ru-RU'),
        sub: `${metrics.critical_incidents.toLocaleString('ru-RU')} критических`,
      },
      {
        label: 'Активные сессии',
        value: metrics.active_sessions.toLocaleString('ru-RU'),
        sub: 'Redis session:*',
      },
      {
        label: 'Аудит (24ч)',
        value: metrics.audit_events_24h.toLocaleString('ru-RU'),
        sub: 'записей в журнале',
      },
      {
        label: 'Аптайм',
        value: this.formatUptime(metrics.uptime_seconds),
        sub: 'с момента запуска',
      },
    ];

    return html`
      <section class="metrics-card">
        <div class="header">
          <div>
            <h2>Состояние системы</h2>
            <p class="row-meta">
              Последнее обновление:
              ${this.metricsUpdatedAt
                ? new Date(this.metricsUpdatedAt).toLocaleTimeString('ru-RU')
                : '—'}
            </p>
          </div>
          <button class="secondary" @click=${this.handleMetricsRefresh}>
            Обновить метрики
          </button>
        </div>
        <div class="metrics-grid">
          ${cards.map(
            (card) => html`
              <div class="metric">
                <span class="metric-label">${card.label}</span>
                <span class="metric-value">${card.value}</span>
                <span class="metric-sub">${card.sub}</span>
              </div>
            `,
          )}
        </div>
      </section>
    `;
  }

  private formatUptime(seconds: number) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
      return `${days}д ${hours}ч`;
    }
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  }

  private async handleMetricsRefresh() {
    if (!this.isSystemAdmin) return;
    try {
      this.systemMetrics = await this.client.getSystemMetrics();
      this.metricsUpdatedAt = new Date().toISOString();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private renderTemplatesTable() {
    if (this.loading && !this.templates.length) {
      return html`<p>Загружаем...</p>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Статус</th>
            <th>Уровень / Тема</th>
            <th>Версия</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${this.templates.map(
            (item) => html`
              <tr>
                <td>
                  <strong>${item.slug}</strong>
                  <div class="row-meta">
                    ${item.pii_flags.length
                      ? html`<span>PII: ${item.pii_flags.join(', ')}</span>`
                      : null}
                    ${item.source_refs.length
                      ? html`<span>Источники: ${item.source_refs.join(', ')}</span>`
                      : null}
                  </div>
                </td>
                <td>
                  <span class="status-pill">${item.status}</span>
                </td>
                <td>
                  <div>${item.level?.name ?? '—'}</div>
                  <div class="row-meta">
                    ${item.topic?.name ?? '—'} • ${item.topic?.slug ?? '—'}
                  </div>
                </td>
                <td>
                  <div>${item.version}</div>
                  <div class="row-meta">${item.difficulty ?? '—'}</div>
                  <div class="row-meta">${item.updated_at}</div>
                </td>
                <td>
                  <div class="actions">
                    <button
                      @click=${() => this.publishTemplate(item)}
                      ?disabled=${item.status === 'published'}
                    >
                      Publish
                    </button>
                    <button class="secondary" @click=${() => this.revertTemplate(item)}>
                      Revert
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  private renderQueueCard() {
    if (!this.queue) {
      return html`<p>Очередь загружается...</p>`;
    }

    return html`
      <div class="queue-info">
        <h3>Очередь <code>content:changes</code></h3>
        <div>Длина: ${this.queue.length}</div>
        ${this.queue.last_event
          ? html`
              <div>
                Последнее событие: ${this.queue.last_event.action} →
                ${this.queue.last_event.template_id}
              </div>
            `
          : html`<div>Событий пока нет</div>`}
      </div>
    `;
  }

  private renderFeatureFlagsCard() {
    if (!this.featureFlags.length) {
      return html`<p>Флаги загружаются...</p>`;
    }

    return html`
      <div class="flag-list">
        <h3>Feature Flags</h3>
        ${this.featureFlags.map(
          (flag) => html`
            <div class="flag">
              <div>
                <h4>${flag.flag_name}</h4>
                <div class="row-meta">Последние изменения: ${flag.updated_at}</div>
              </div>
              <label>
                <input
                  type="checkbox"
                  .checked=${flag.enabled}
                  @change=${() => this.toggleFeatureFlag(flag)}
                />
                Вкл
              </label>
            </div>
          `,
        )}
      </div>
    `;
  }

  private applyFilterChange(
    field: keyof TemplateFilterParams,
    value: string | number | undefined,
  ) {
    this.filter = {
      ...this.filter,
      [field]: value ?? undefined,
    };
    this.refreshTemplates();
  }

  private async refreshData() {
    this.loading = true;
    this.error = undefined;
    try {
      const metricsPromise: Promise<SystemMetrics | undefined> = this.isSystemAdmin
        ? this.client.getSystemMetrics()
        : Promise.resolve(undefined);
      const backupsPromise: Promise<BackupRecord[] | null> = this.isSystemAdmin
        ? this.client.listBackups().catch((err) => {
            console.error('Failed to load backups', err);
            return null;
          })
        : Promise.resolve(null);

      const [templates, queue, flags, metrics, backups] = await Promise.all([
        this.client.listAdminTemplates(this.filter),
        this.client.getEmbeddingQueueStatus(),
        this.client.listFeatureFlags(),
        metricsPromise,
        backupsPromise,
      ]);
      this.templates = templates;
      this.queue = queue;
      this.featureFlags = flags;
      this.systemMetrics = metrics ?? undefined;
      if (metrics) {
        this.metricsUpdatedAt = new Date().toISOString();
      }
      this.backups = backups;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async refreshTemplates() {
    this.loading = true;
    this.error = undefined;
    try {
      const templates = await this.client.listAdminTemplates(this.filter);
      this.templates = templates;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async handleCreateBackup() {
    if (this.creatingBackup) return;
    this.creatingBackup = true;
    this.error = undefined;
    try {
      await this.client.createBackup({ label: undefined });
      this.showNotice?.('Резервная копия создана', 'success');
      this.backups = await this.client.listBackups();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось создать бэкап';
    } finally {
      this.creatingBackup = false;
    }
  }

  private async handleRestoreBackup(record: BackupRecord) {
    if (!record.id) {
      this.error = 'Невозможно восстановить бэкап без идентификатора';
      return;
    }

    const confirmation = window.confirm(
      `Восстановить данные из бэкапа «${record.label}»? Текущие данные могут быть перезаписаны.`,
    );
    if (!confirmation) {
      return;
    }

    this.restoringBackupId = record.id;
    this.error = undefined;
    try {
      const response = await this.client.restoreBackup(record.id);
      this.showNotice?.(response.message ?? 'Восстановление запущено', 'success');
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось запустить восстановление';
    } finally {
      this.restoringBackupId = null;
    }
  }

  private renderBackupsSection() {
    if (!this.isSystemAdmin) {
      return null;
    }

    return html`
      <section>
        <div class="header">
          <h3>Резервные копии</h3>
          <button
            class="primary"
            @click=${this.handleCreateBackup}
            ?disabled=${this.creatingBackup}
          >
            ${this.creatingBackup ? 'Создание...' : 'Создать бэкап'}
          </button>
        </div>
        ${!this.backups
          ? html`<p>Загружаем список...</p>`
          : this.backups.length === 0
            ? html`<p>Записей пока нет</p>`
            : html`
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Метка</th>
                        <th>Статус</th>
                        <th>Путь</th>
                        <th>Создан</th>
                        <th aria-label="Действия">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.backups.map(
                        (backup) => html`
                          <tr>
                            <td>${backup.label}</td>
                            <td>${backup.status}</td>
                            <td>${backup.storage_path ?? '—'}</td>
                            <td>
                              ${new Date(backup.created_at).toLocaleString('ru-RU')}
                            </td>
                            <td>
                              <button
                                class="ghost"
                                @click=${() => this.handleRestoreBackup(backup)}
                                ?disabled=${this.restoringBackupId === backup.id ||
                                !backup.id}
                              >
                                ${this.restoringBackupId === backup.id
                                  ? 'Восстановление...'
                                  : 'Восстановить'}
                              </button>
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `}
      </section>
    `;
  }

  private async publishTemplate(template: AdminTemplateSummary) {
    try {
      await this.client.updateAdminTemplate(template.id, {
        status: 'published',
      });
      this.refreshTemplates();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private async revertTemplate(template: AdminTemplateSummary) {
    const reason = window.prompt('Причина возврата в draft?')?.trim();
    if (!reason) {
      return;
    }
    try {
      const payload: TemplateRevertPayload = { reason };
      await this.client.revertAdminTemplate(template.id, payload);
      this.refreshTemplates();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private async toggleFeatureFlag(flag: FeatureFlagRecord) {
    try {
      await this.client.updateFeatureFlag(flag.flag_name, {
        enabled: !flag.enabled,
      });
      this.featureFlags = await this.client.listFeatureFlags();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
}
