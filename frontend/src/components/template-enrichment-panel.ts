import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import type {
  AdminTemplateSummary,
  TemplateEnrichmentPayload,
  TemplateEnrichmentRun,
  TemplateEnrichmentTask,
} from '@/lib/api-types';
import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';

@customElement('template-enrichment-panel')
export class TemplateEnrichmentPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .panel {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    h3 {
      margin: 0 0 0.5rem;
    }

    select,
    input[type='number'] {
      width: 100%;
      padding: 0.5rem;
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
    }

    form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      align-items: end;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th,
    td {
      padding: 0.75rem 0.6rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .controls {
      display: flex;
      gap: 0.5rem;
    }

    button.primary {
      border: none;
      border-radius: var(--radius-large);
      padding: 0.6rem 1.2rem;
      background: var(--accent);
      color: white;
      cursor: pointer;
    }

    button.secondary {
      border-radius: var(--radius-large);
      padding: 0.4rem 0.8rem;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-main);
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .notice {
      border-radius: var(--radius-large);
      padding: 0.75rem 1rem;
      border: 1px solid transparent;
    }

    .notice.success {
      background: rgba(34, 197, 94, 0.12);
      border-color: rgba(34, 197, 94, 0.4);
      color: #15803d;
    }

    .notice.error {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.4);
      color: #b91c1c;
    }
  `;

  private client = new ApiClient();

  @state()
  declare private templates: AdminTemplateSummary[];

  @state()
  declare private selectedTemplateId?: string;

  @state()
  declare private runs: TemplateEnrichmentRun[];

  @state()
  declare private tasks: TemplateEnrichmentTask[];

  @state()
  declare private loading: boolean;

  @state()
  declare private dataLoading: boolean;

  @state()
  declare private notice?: { message: string; type: 'success' | 'error' };

  @state()
  declare private formState: TemplateEnrichmentPayload;

  @state()
  declare private deletingTaskId?: string;

  @state()
  declare private regeneratingTaskId?: string;

  constructor() {
    super();
    this.templates = [];
    this.selectedTemplateId = undefined;
    this.runs = [];
    this.tasks = [];
    this.loading = false;
    this.dataLoading = false;
    this.notice = undefined;
    this.formState = {
      count: 5,
      allow_reuse: false,
      reject_limit: undefined,
    };
    this.deletingTaskId = undefined;
    this.regeneratingTaskId = undefined;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.client.setToken(authService.getToken() ?? undefined);
    this.loadTemplates();
  }

  render() {
    return html`
      <section class="panel">
        <div>
          <h3>Обогащение шаблонов</h3>
          <p>
            Сгенерируйте набор вариаций по выбранному шаблону, затем проверьте их и при
            необходимости удалите или перегенерируйте.
          </p>
        </div>

        ${this.notice
          ? html`<div class="notice ${this.notice.type}">${this.notice.message}</div>`
          : null}
        ${this.renderTemplateSelector()}
        ${this.selectedTemplateId
          ? html`
              ${this.renderEnrichmentForm()} ${this.renderRunsSection()}
              ${this.renderTasksSection()}
            `
          : html`<p>Выберите шаблон, чтобы начать обогащение.</p>`}
      </section>
    `;
  }

  private renderTemplateSelector() {
    return html`
      <div class="form-field">
        <label for="template-select">Шаблон</label>
        <select
          id="template-select"
          ?disabled=${this.loading}
          @change=${(event: Event) => this.handleTemplateChange(event)}
        >
          <option value="" ?selected=${!this.selectedTemplateId} disabled>
            Выберите шаблон
          </option>
          ${this.templates.map(
            (template) => html`
              <option
                value=${template.id}
                ?selected=${template.id === this.selectedTemplateId}
              >
                ${template.slug} (${template.status})
              </option>
            `,
          )}
        </select>
      </div>
    `;
  }

  private renderEnrichmentForm() {
    return html`
      <form @submit=${this.handleEnrichmentSubmit}>
        <div class="form-field">
          <label for="count-input">Количество вариаций</label>
          <input
            id="count-input"
            type="number"
            min="1"
            max="200"
            .value=${String(this.formState.count)}
            @input=${(event: Event) =>
              this.updateFormField(
                'count',
                Number((event.target as HTMLInputElement).value),
              )}
          />
        </div>
        <div class="form-field">
          <label for="limit-input">Дневной лимит</label>
          <input
            id="limit-input"
            type="number"
            min="1"
            placeholder="не задан"
            .value=${this.formState.reject_limit
              ? String(this.formState.reject_limit)
              : ''}
            @input=${(event: Event) => {
              const value = (event.target as HTMLInputElement).value;
              this.updateFormField('reject_limit', value ? Number(value) : undefined);
            }}
          />
        </div>
        <div class="form-field">
          <label>Переиспользовать шаблон</label>
          <div>
            <label>
              <input
                type="checkbox"
                .checked=${this.formState.allow_reuse}
                @change=${(event: Event) =>
                  this.updateFormField(
                    'allow_reuse',
                    (event.target as HTMLInputElement).checked,
                  )}
              />
              Разрешить повтор уже показанных заданий
            </label>
          </div>
        </div>
        <div class="controls">
          <button class="primary" type="submit" ?disabled=${this.dataLoading}>
            ${this.dataLoading ? 'Генерация...' : 'Запустить генерацию'}
          </button>
        </div>
      </form>
    `;
  }

  private renderRunsSection() {
    return html`
      <div>
        <h3>История запусков</h3>
        ${this.runs.length === 0
          ? html`<p class="muted">Запусков пока не было.</p>`
          : html`
              <div class="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Статус</th>
                      <th>Успехов</th>
                      <th>Ошибок</th>
                      <th>Лимит</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.runs.map(
                      (run) => html`
                        <tr>
                          <td>${new Date(run.started_at).toLocaleString('ru-RU')}</td>
                          <td>${this.renderStatus(run.status)}</td>
                          <td>${run.success_count}/${run.count}</td>
                          <td>${run.error_count}</td>
                          <td>${run.reject_limit ?? '—'}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
    `;
  }

  private renderTasksSection() {
    return html`
      <div>
        <h3>Сгенерированные задания</h3>
        ${this.tasks.length === 0
          ? html`
              <p class="muted">
                Список пуст. Запустите генерацию или дождитесь завершения текущего
                процесса.
              </p>
            `
          : html`
              <div class="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Текст</th>
                      <th>Ответ</th>
                      <th>Статус</th>
                      <th>Сгенерировано</th>
                      <th aria-label="Действия">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.tasks.map(
                      (task) => html`
                        <tr>
                          <td>${task.text}</td>
                          <td>${task.correct_answer}</td>
                          <td>${task.status}</td>
                          <td>${new Date(task.generated_at).toLocaleString('ru-RU')}</td>
                          <td>
                            <div class="controls">
                              <button
                                class="secondary"
                                @click=${() => this.handleRegenerateTask(task)}
                                ?disabled=${this.regeneratingTaskId === task.id}
                              >
                                ${this.regeneratingTaskId === task.id
                                  ? 'Перегенерация...'
                                  : 'Перегенерировать'}
                              </button>
                              <button
                                class="secondary"
                                @click=${() => this.handleDeleteTask(task)}
                                ?disabled=${this.deletingTaskId === task.id}
                              >
                                ${this.deletingTaskId === task.id
                                  ? 'Удаление...'
                                  : 'Удалить'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
      </div>
    `;
  }

  private updateFormField<K extends keyof TemplateEnrichmentPayload>(
    field: K,
    value: TemplateEnrichmentPayload[K],
  ) {
    this.formState = { ...this.formState, [field]: value };
  }

  private async handleEnrichmentSubmit(event: Event) {
    event.preventDefault();
    if (!this.selectedTemplateId) {
      return;
    }
    this.dataLoading = true;
    try {
      await this.client.startTemplateEnrichmentRun(
        this.selectedTemplateId,
        this.formState,
      );
      this.showNotice('Генерация запущена', 'success');
      await this.refreshData();
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось запустить генерацию',
        'error',
      );
    } finally {
      this.dataLoading = false;
    }
  }

  private async handleDeleteTask(task: TemplateEnrichmentTask) {
    if (!this.selectedTemplateId) {
      return;
    }
    if (!window.confirm('Удалить выбранный вариант?')) {
      return;
    }
    this.deletingTaskId = task.id;
    try {
      await this.client.deleteTemplateEnrichmentTask(this.selectedTemplateId, task.id);
      this.showNotice('Вариант удалён', 'success');
      await this.refreshTasks();
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось удалить задание',
        'error',
      );
    } finally {
      this.deletingTaskId = undefined;
    }
  }

  private async handleRegenerateTask(task: TemplateEnrichmentTask) {
    if (!this.selectedTemplateId) {
      return;
    }
    this.regeneratingTaskId = task.id;
    try {
      await this.client.regenerateTemplateEnrichmentTask(
        this.selectedTemplateId,
        task.id,
      );
      this.showNotice('Вариант обновлён', 'success');
      await this.refreshTasks();
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось перегенерировать задание',
        'error',
      );
    } finally {
      this.regeneratingTaskId = undefined;
    }
  }

  private async loadTemplates() {
    this.loading = true;
    try {
      const templates = await this.client.listAdminTemplates({
        status: 'published',
        limit: 100,
      });
      this.templates = templates;
      if (!this.selectedTemplateId && templates.length) {
        this.selectedTemplateId = templates[0].id;
        await this.refreshData();
      }
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось загрузить шаблоны',
        'error',
      );
    } finally {
      this.loading = false;
    }
  }

  private async refreshData() {
    try {
      await Promise.all([this.refreshRuns(), this.refreshTasks()]);
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось обновить данные',
        'error',
      );
    }
  }

  private async refreshRuns() {
    if (!this.selectedTemplateId) {
      return;
    }
    try {
      const runs = await this.client.listTemplateEnrichmentRuns(this.selectedTemplateId);
      this.runs = runs;
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось загрузить историю запусков',
        'error',
      );
    }
  }

  private async refreshTasks() {
    if (!this.selectedTemplateId) {
      return;
    }
    try {
      const tasks = await this.client.listTemplateEnrichmentTasks(
        this.selectedTemplateId,
        { limit: 50 },
      );
      this.tasks = tasks;
    } catch (error) {
      this.showNotice(
        error instanceof Error ? error.message : 'Не удалось загрузить задания',
        'error',
      );
    }
  }

  private handleTemplateChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedTemplateId = value || undefined;
    if (this.selectedTemplateId) {
      this.refreshData();
    }
  }

  private renderStatus(status: string) {
    switch (status) {
      case 'completed':
        return 'Готово';
      case 'failed':
        return 'Ошибка';
      default:
        return 'В процессе';
    }
  }

  private showNotice(message: string, type: 'success' | 'error' = 'success') {
    this.notice = { message, type };
    window.setTimeout(() => {
      if (this.notice?.message === message) {
        this.notice = undefined;
      }
    }, 4000);
  }
}
