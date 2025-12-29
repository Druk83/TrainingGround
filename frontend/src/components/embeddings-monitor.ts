import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  AdminTemplateSummary,
  EmbeddingConsistencyReport,
  EmbeddingJobSummary,
  QueueStatus,
} from '@/lib/api-types';

type RebuildMode = 'all' | 'changed' | 'new' | 'selected';

@customElement('embeddings-monitor')
export class EmbeddingsMonitor extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    .panel {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .section {
      border-radius: var(--radius-large);
      padding: 1rem;
      background: var(--surface-3);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    h2,
    h3 {
      margin: 0 0 0.5rem;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.45rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      border-color: transparent;
      color: #fff;
    }

    .queue-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }

    .label {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .progress-bar {
      height: 8px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-inner {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #0ea5e9);
      transition: width 0.3s ease;
    }

    .collections {
      display: flex;
      gap: 0.75rem;
    }

    .collection-card {
      flex: 1;
      padding: 0.75rem;
      border-radius: var(--radius-large);
      background: var(--surface-2);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .consistency ul {
      margin: 0;
      padding-left: 1.2rem;
      color: var(--text-muted);
    }

    .row-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .error {
      color: #f87171;
    }

    .template-selection {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.9rem;
      background: var(--surface-3);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.65rem;
    }

    .template-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.35rem;
    }

    .template-option {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: var(--text-main);
      border-radius: var(--radius-large);
      padding: 0.4rem 0.5rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.02);
    }

    .template-option input {
      accent-color: var(--primary-main);
    }
  `;

  private readonly client = new ApiClient({
    jwt: authService.getToken() ?? undefined,
  });
  @state() private queue?: QueueStatus;
  @state() private loading = false;
  @state() private rebuildRunning = false;
  @state() private job?: EmbeddingJobSummary;
  @state() private consistency?: EmbeddingConsistencyReport;
  @state() private error?: string;
  @state() private rebuildMessage = '';
  @state() private templates: AdminTemplateSummary[] = [];
  @state() private selectedTemplateIds: string[] = [];
  @state() private templateLoading = false;
  @state() private templateError?: string;

  connectedCallback() {
    super.connectedCallback();
    this.loadQueue();
    this.loadProgress();
    this.loadConsistency();
    this.loadTemplateOptions();
  }

  render() {
    return html`
      <section class="panel">
        <div class="section">
          <h2>Статус очереди content:changes</h2>
          ${this.queue
            ? html`
                <div class="queue-row">
                  <div>
                    <strong>${this.queue.length}</strong>
                    <span class="label">длина очереди</span>
                  </div>
                  <div>
                    <strong>${this.queue.last_event?.action ?? '—'}</strong>
                    <span class="label">посл. действие</span>
                  </div>
                  <div>
                    <strong>${this.queue.last_event?.timestamp ?? '—'}</strong>
                    <span class="label">время</span>
                  </div>
                </div>
              `
            : html`<p class="label">Очередь загружается...</p>`}
        </div>

        <div class="section">
          <h3>Пересоздание эмбеддингов</h3>
          ${this.error ? html`<p class="row-meta error">${this.error}</p>` : null}
          <div class="actions">
            <button
              class="primary"
              @click=${() => this.handleRebuild('all')}
              ?disabled=${this.rebuildRunning}
            >
              ${this.rebuildRunning ? 'Пересоздание...' : 'Пересоздать все'}
            </button>
            <button @click=${() => this.handleRebuild('changed')}>
              Только изменённые
            </button>
            <button @click=${() => this.handleRebuild('new')}>Только новые</button>
          </div>
          <div class="template-selection">
            <div class="preview-header">
              <span>Выбор шаблонов</span>
              <span class="row-meta">${this.selectedTemplateIds.length} выбрано</span>
            </div>
            ${this.templateLoading
              ? html`<p class="row-meta">Загружаем шаблоны...</p>`
              : this.templates.length
                ? html`
                    <div class="template-list">
                      ${this.templates.slice(0, 12).map(
                        (template) => html`
                          <label class="template-option">
                            <input
                              type="checkbox"
                              .checked=${this.selectedTemplateIds.includes(template.id)}
                              @change=${() => this.toggleTemplateSelection(template.id)}
                            />
                            <span>${template.slug} • ${template.level?.name ?? '—'}</span>
                          </label>
                        `,
                      )}
                    </div>
                  `
                : html`<p class="row-meta">Нет доступных шаблонов.</p>`}
            <div class="actions">
              <button
                class="primary"
                @click=${() => this.handleRebuild('selected', this.selectedTemplateIds)}
                ?disabled=${!this.selectedTemplateIds.length || this.rebuildRunning}
              >
                ${this.rebuildRunning && this.rebuildMessage.startsWith('Режим: selected')
                  ? 'Пересоздание...'
                  : 'Пересоздать выбранные'}
              </button>
            </div>
            ${this.templateError
              ? html`<p class="row-meta error">${this.templateError}</p>`
              : null}
          </div>
          <div class="progress-bar">
            <div
              class="progress-inner"
              style=${`width: ${this.job && this.job.total ? Math.round((this.job.processed / this.job.total) * 100) : 0}%`}
            ></div>
          </div>
          <p class="row-meta">
            ${this.job
              ? `${this.job.processed}/${this.job.total} • ${this.job.status}`
              : 'Нет активных задач'}
          </p>
        </div>

        <div class="section">
          <h3>Мониторинг Qdrant</h3>
          <div class="collections">
            <div class="collection-card">
              <strong>templates</strong>
              <span>Векторов: —</span>
            </div>
          </div>
          <div class="consistency">
            <div class="actions">
              <button class="primary" @click=${this.loadConsistency}>
                Проверить консистентность
              </button>
            </div>
            ${this.consistency
              ? html`
                  <ul>
                    <li>Mongo: ${this.consistency.mongo_templates}</li>
                    <li>Qdrant: ${this.consistency.qdrant_vectors}</li>
                    ${this.consistency.discrepancies.map(
                      (issue) => html`<li>${issue}</li>`,
                    )}
                  </ul>
                `
              : html`<p class="row-meta">Консистентность ещё не проверялась.</p>`}
          </div>
        </div>
      </section>
    `;
  }

  private async loadQueue() {
    try {
      this.queue = await this.client.getEmbeddingQueueStatus();
    } catch (error) {
      console.error(error);
    }
  }

  private async loadProgress() {
    try {
      this.job = await this.client.getEmbeddingProgress();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось загрузить прогресс';
    }
  }

  private async loadConsistency() {
    try {
      this.consistency = await this.client.getEmbeddingConsistency();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось проверить консистентность';
    }
  }

  private async loadTemplateOptions() {
    this.templateLoading = true;
    this.templateError = undefined;
    try {
      this.templates = await this.client.listAdminTemplates({ limit: 12 });
    } catch (error) {
      this.templateError =
        error instanceof Error ? error.message : 'Не удалось загрузить шаблоны';
    } finally {
      this.templateLoading = false;
    }
  }

  private toggleTemplateSelection(templateId: string) {
    this.selectedTemplateIds = this.selectedTemplateIds.includes(templateId)
      ? this.selectedTemplateIds.filter((id) => id !== templateId)
      : [...this.selectedTemplateIds, templateId];
  }

  private async handleRebuild(mode: RebuildMode, templateIds?: string[]) {
    this.rebuildRunning = true;
    this.error = undefined;
    this.rebuildMessage = `Режим: ${mode}`;
    try {
      await this.client.rebuildEmbeddings({
        mode,
        template_ids: templateIds && templateIds.length ? templateIds : undefined,
      });
      await this.loadProgress();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось запустить пересоздание';
    } finally {
      this.rebuildRunning = false;
    }
  }
}
