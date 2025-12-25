import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import type {
  AdminTemplateSummary,
  QueueStatus,
  FeatureFlagRecord,
  TemplateFilterParams,
  TemplateRevertPayload,
} from '@/lib/api-types';

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

    .filters {
      margin: 1.5rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
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
  @state()
  private templates: AdminTemplateSummary[];
  @state()
  private queue?: QueueStatus;
  @state()
  private featureFlags: FeatureFlagRecord[];
  @state()
  private loading: boolean;
  @state()
  private error?: string;
  @state()
  private filter: TemplateFilterParams;

  constructor() {
    super();
    // Initialize state properties
    this.templates = [];
    this.featureFlags = [];
    this.loading = false;
    this.filter = {};

    // Read JWT token from localStorage
    const token = localStorage.getItem('auth_token');
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.refreshData();
  }

  render() {
    return html`
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
        </div>
      </div>
    `;
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
      const [templates, queue, flags] = await Promise.all([
        this.client.listAdminTemplates(this.filter),
        this.client.getEmbeddingQueueStatus(),
        this.client.listFeatureFlags(),
      ]);
      this.templates = templates;
      this.queue = queue;
      this.featureFlags = flags;
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
