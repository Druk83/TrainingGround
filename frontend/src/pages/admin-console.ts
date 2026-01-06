import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@/components/app-header';
import '@/components/content-quality';
import '@/components/embeddings-monitor';
import '@/components/feature-flags-panel';
import '@/components/rules-management';
import '@/components/template-management';
import '@/components/template-enrichment-panel';
import '@/components/topics-management';
import { ApiClient } from '@/lib/api-client';
import type { BackupRecord, SystemMetrics } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

type AdminTab =
  | 'dashboard'
  | 'templates'
  | 'topics'
  | 'rules'
  | 'quality'
  | 'embeddings'
  | 'enrichment'
  | 'feature-flags';

const TAB_DEFINITIONS: ReadonlyArray<{
  id: AdminTab;
  label: string;
  description: string;
  roles: readonly string[];
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Системные метрики и бэкапы',
    roles: ['admin'],
  },
  {
    id: 'templates',
    label: 'Шаблоны',
    description: 'Создание, ревью и версии',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'topics',
    label: 'Темы и уровни',
    description: 'Маршруты обучения',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'rules',
    label: 'Правила',
    description: 'Описания, примеры и покрытие',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'quality',
    label: 'Качество',
    description: 'Метрики, валидатор и дубликаты',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'embeddings',
    label: 'Эмбеддинги',
    description: 'Очередь и консистентность',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'enrichment',
    label: 'Обогащение',
    description: 'Генерация и проверка заданий',
    roles: ['admin', 'content_admin'],
  },
  {
    id: 'feature-flags',
    label: 'Feature Flags',
    description: 'Эксперименты и rollout',
    roles: ['admin'],
  },
];

@customElement('admin-console')
export class AdminConsole extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--surface-1);
      min-height: 100vh;
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    main.console {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto 4rem;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.75rem, 3vw, 2.5rem);
    }

    .header p {
      margin: 0.35rem 0 0;
      color: var(--text-muted);
    }

    .tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin: 1.5rem 0;
    }

    .tab {
      border-radius: var(--radius-large);
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      padding: 0.9rem 1rem;
      cursor: pointer;
      text-align: left;
      transition:
        background 0.2s ease,
        border-color 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .tab:hover {
      border-color: rgba(255, 255, 255, 0.25);
    }

    .tab.active {
      background: var(--primary-soft);
      border-color: var(--primary-main);
      color: #fff;
    }

    .tab-description {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .tab-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .panel {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
    }

    .metrics-card {
      padding: 0;
      background: transparent;
      box-shadow: none;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .metric {
      padding: 1rem;
      border-radius: var(--radius-large);
      background: var(--surface-3);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .metric-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .metric-value {
      font-size: 1.4rem;
      font-weight: 600;
    }

    .metric-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .row-meta {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .notice {
      border-radius: var(--radius-large);
      padding: 0.9rem 1rem;
      border: 1px solid transparent;
      margin: 1rem 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(34, 197, 94, 0.12);
      color: #0f766e;
    }

    .notice.error {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.5);
      color: #b91c1c;
    }

    .notice button {
      background: transparent;
      border: none;
      color: inherit;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0;
    }

    .error {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      background: rgba(249, 115, 22, 0.12);
      border-radius: var(--radius-medium);
      border: 1px solid rgba(249, 115, 22, 0.7);
      color: #c2410c;
    }

    .backups-card h3 {
      margin: 0 0 0.5rem;
      font-size: 1.2rem;
    }

    .backups-card .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .table-wrapper {
      overflow-x: auto;
      margin-top: 1rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.8rem 0.6rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    td:last-child {
      width: 220px;
    }

    td button {
      margin-right: 0.4rem;
    }

    .muted {
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      font-weight: 600;
      padding: 0.6rem 1rem;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      color: #fff;
      border-color: transparent;
    }

    button.secondary {
      background: transparent;
    }

    @media (max-width: 640px) {
      main.console {
        padding: 1.25rem;
      }

      .header {
        flex-direction: column;
        align-items: flex-start;
      }

      .tabs {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
    }
  `;

  private readonly client: ApiClient;
  @state() declare private systemMetrics: SystemMetrics | undefined;
  @state() declare private metricsUpdatedAt: string | undefined;
  @state() declare private backups: BackupRecord[] | null;
  @state() declare private creatingBackup: boolean;
  @state() declare private restoringBackupId: string | null;
  @state() declare private loading: boolean;
  @state() declare private error: string | undefined;
  @state() declare private notice:
    | { message: string; type: 'success' | 'error' }
    | undefined;
  @state() declare private activeTab: AdminTab;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
    this.backups = null;
    this.creatingBackup = false;
    this.restoringBackupId = null;
    this.loading = false;

    // Установить дефолтный таб в зависимости от роли
    const user = authService.getUser();
    const userRole = user?.role ?? 'student';
    if (userRole === 'content_admin') {
      this.activeTab = 'templates';
    } else {
      this.activeTab = 'dashboard';
    }
  }

  private getAvailableTabs() {
    const user = authService.getUser();
    const userRole = user?.role ?? 'student';
    const availableTabs = TAB_DEFINITIONS.filter((tab) => tab.roles.includes(userRole));
    console.log(
      '[admin-console] Available tabs for role',
      userRole,
      ':',
      availableTabs.map((t) => t.label),
    );
    return availableTabs;
  }

  connectedCallback() {
    super.connectedCallback();
    document.title = 'Администрирование контента - TrainingGround';
    this.refreshData();
  }

  render() {
    return html`
      <app-header></app-header>
      <main class="console">
        <div class="header">
          <div>
            <h1>Администрирование контента</h1>
            <p>Шаблоны, темы, правила, качество и эмбеддинги в одном пространстве.</p>
          </div>
          <div>${this.loading ? html`<span>Обновляем данные...</span>` : null}</div>
        </div>
        ${this.notice
          ? html`
              <div class="notice ${this.notice.type}">
                <span>${this.notice.message}</span>
                <button type="button" @click=${() => (this.notice = undefined)}>
                  &times;
                </button>
              </div>
            `
          : null}
        ${this.error ? html`<div class="error">${this.error}</div>` : null}
        <div class="tabs">
          ${this.getAvailableTabs().map(
            (tab) => html`
              <button
                class=${`tab ${this.activeTab === tab.id ? 'active' : ''}`}
                @click=${() => {
                  this.activeTab = tab.id;
                }}
              >
                <strong>${tab.label}</strong>
                <span class="tab-description">${tab.description}</span>
              </button>
            `,
          )}
        </div>
        <section class="tab-content">${this.renderActiveTab()}</section>
      </main>
    `;
  }

  private renderActiveTab() {
    switch (this.activeTab) {
      case 'dashboard':
        return this.renderDashboard();
      case 'templates':
        return html`<template-management></template-management>`;
      case 'topics':
        return html`<topics-management></topics-management>`;
      case 'rules':
        return html`<rules-management></rules-management>`;
      case 'quality':
        return html`<content-quality></content-quality>`;
      case 'embeddings':
        return html`<embeddings-monitor></embeddings-monitor>`;
      case 'enrichment':
        return html`<template-enrichment-panel></template-enrichment-panel>`;
      case 'feature-flags':
        return html`<feature-flags-panel></feature-flags-panel>`;
      default:
        return html`<div class="panel"><p>Раздел в разработке.</p></div>`;
    }
  }

  private renderDashboard() {
    return html`
      <section class="panel">${this.renderSystemMetricsSection()}</section>
      <section class="panel backups-card">${this.renderBackupsSection()}</section>
    `;
  }

  private renderSystemMetricsSection() {
    if (!this.systemMetrics) {
      return html`
        <div class="metrics-card">
          <h2>Состояние системы</h2>
          <p class="row-meta">Метрики загружаются...</p>
        </div>
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
        sub: `${metrics.total_incidents.toLocaleString('ru-RU')} инцидентов`,
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
      <div class="metrics-card">
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
      </div>
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
    await this.refreshData();
  }

  private async refreshData() {
    // Только суперпользователь (admin) может загружать dashboard данные
    const user = authService.getUser();
    const userRole = user?.role ?? 'student';
    if (userRole !== 'admin') {
      return;
    }

    this.loading = true;
    this.error = undefined;
    try {
      const [metrics, backups] = await Promise.all([
        this.client.getSystemMetrics(),
        this.client.listBackups().catch((err) => {
          console.error('Failed to load backups', err);
          return null;
        }),
      ]);
      this.systemMetrics = metrics;
      if (metrics) {
        this.metricsUpdatedAt = new Date().toISOString();
      }
      this.backups = backups;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private renderBackupsSection() {
    return html`
      <div class="header">
        <div>
          <h3>Резервные копии</h3>
          <p class="row-meta">Сделано администратором системы</p>
        </div>
        <button
          class="primary"
          @click=${this.handleCreateBackup}
          ?disabled=${this.creatingBackup}
        >
          ${this.creatingBackup ? 'Создание...' : 'Создать бэкап'}
        </button>
      </div>
      ${!this.backups
        ? html`<p class="row-meta">Загружаем список...</p>`
        : this.backups.length === 0
          ? html`<p class="row-meta">Записей пока нет</p>`
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
                          <td class="muted">${backup.storage_path ?? '—'}</td>
                          <td>${new Date(backup.created_at).toLocaleString('ru-RU')}</td>
                          <td>
                            <button
                              class="secondary"
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
    `;
  }

  private async handleCreateBackup() {
    if (this.creatingBackup) return;
    this.creatingBackup = true;
    this.error = undefined;
    try {
      await this.client.createBackup({ label: undefined });
      this.showNotice('Резервная копия создана', 'success');
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
      this.showNotice(response.message ?? 'Восстановление запущено', 'success');
      this.backups = await this.client.listBackups();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось запустить восстановление';
    } finally {
      this.restoringBackupId = null;
    }
  }

  private showNotice(message: string, type: 'success' | 'error' = 'success') {
    this.notice = { message, type };
    window.setTimeout(() => {
      this.notice = undefined;
    }, 5000);
  }
}
