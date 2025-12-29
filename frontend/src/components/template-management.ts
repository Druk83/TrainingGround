import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  AdminTemplateDetail,
  AdminTemplateSummary,
  TemplateFilterParams,
  TemplateVersionSummary,
} from '@/lib/api-types';
import '@/components/template-form';
import '@/components/template-version-history';
import type { TemplateFormValues, TemplatePIIFlag } from '@/components/template-form';
import type { TemplateVersionHistoryEntry } from '@/components/template-version-history';

const ALLOWED_DIFFICULTIES = ['A1', 'A2', 'B1', 'B2'] as const;

@customElement('template-management')
export class TemplateManagement extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    .templates-panel {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .notice {
      border-radius: var(--radius-large);
      padding: 0.8rem 1rem;
      border: 1px solid transparent;
      background: rgba(34, 197, 94, 0.12);
      color: #047857;
    }

    .notice.error {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.5);
      color: #b91c1c;
    }

    .error {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-medium);
      background: rgba(248, 113, 113, 0.15);
      border: 1px solid rgba(248, 113, 113, 0.7);
      color: #9f1239;
    }

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .filters label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .filters input,
    .filters select {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      padding: 0.4rem 0.8rem;
      color: var(--text-main);
    }

    .table-wrapper {
      overflow-x: auto;
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

    td:last-child {
      width: 260px;
    }

    .row-meta {
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .actions button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      font-weight: 600;
      padding: 0.55rem 0.9rem;
      cursor: pointer;
    }

    .actions button.primary {
      background: var(--primary-main);
      border-color: transparent;
      color: #fff;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 100;
      padding: 1rem;
    }

    .modal {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.2rem;
      width: min(720px, 100%);
      box-shadow: var(--shadow-soft);
    }

    .modal header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .modal header h3 {
      margin: 0;
    }

    .modal header button {
      border: none;
      background: transparent;
      color: var(--text-main);
      font-size: 1.5rem;
      cursor: pointer;
    }

    @media (max-width: 640px) {
      .filters {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }

      td,
      th {
        padding: 0.55rem 0.4rem;
      }
    }
  `;

  private readonly client = new ApiClient({
    jwt: authService.getToken() ?? undefined,
  });
  @state() private templates: AdminTemplateSummary[] = [];
  @state() private filter: TemplateFilterParams = {};
  @state() private loading = false;
  @state() private error?: string;
  @state() private notice?: { message: string; type: 'success' | 'error' };
  @state() private showForm = false;
  @state() private formMode: 'create' | 'edit' = 'create';
  @state() private formLoading = false;
  @state() private editingTemplate?: AdminTemplateDetail;
  @state() private formValues?: TemplateFormValues;
  @state() private showHistoryFor?: AdminTemplateSummary;
  @state() private versionHistory: TemplateVersionSummary[] = [];
  @state() private moderationLoadingId?: string;

  connectedCallback() {
    super.connectedCallback();
    this.refreshTemplates();
  }

  render() {
    return html`
      <section class="templates-panel">
        <div class="header">
          <div>
            <h2>Шаблоны заданий</h2>
            <p class="row-meta">Фильтры, publish/revert, история и форма создания</p>
          </div>
          <div class="actions">
            <button class="primary" type="button" @click=${this.openCreateForm}>
              Создать шаблон
            </button>
            <button
              class="secondary"
              type="button"
              @click=${this.refreshTemplates}
              ?disabled=${this.loading}
            >
              ${this.loading ? 'Обновляем...' : 'Обновить список'}
            </button>
          </div>
        </div>

        ${this.notice
          ? html` <div class="notice ${this.notice.type}">${this.notice.message}</div> `
          : null}
        ${this.error ? html`<div class="error">${this.error}</div>` : null}

        <div class="filters">
          <label>
            Поиск
            <input
              type="search"
              placeholder="slug / текст"
              .value=${this.filter.q ?? ''}
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
              .value=${this.filter.status ?? ''}
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
              .value=${this.filter.difficulty ?? ''}
              @input=${(event: Event) =>
                this.applyFilterChange(
                  'difficulty',
                  (event.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>
          <label>
            Предел
            <input
              type="number"
              min="1"
              placeholder="25"
              .value=${this.filter.limit ?? ''}
              @input=${(event: Event) => {
                const raw = (event.currentTarget as HTMLInputElement).value;
                this.applyFilterChange('limit', raw ? Number(raw) : undefined);
              }}
            />
          </label>
        </div>

        ${this.loading
          ? html`<p class="row-meta">Загружаем шаблоны...</p>`
          : this.templates.length === 0
            ? html`<p class="row-meta">Шаблоны не найдены.</p>`
            : this.renderTable()}
      </section>

      ${this.showForm ? this.renderFormModal() : null}
      ${this.showHistoryFor ? this.renderHistoryOverlay() : null}
    `;
  }

  private renderTable() {
    return html`
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Slug / PII</th>
              <th>Уровень / Тема</th>
              <th>Статус</th>
              <th>Версия</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${this.templates.map(
              (template) => html`
                <tr>
                  <td>
                    <strong>${template.slug}</strong>
                    <div class="row-meta">
                      ${template.pii_flags.length
                        ? html`<span>PII: ${template.pii_flags.join(', ')}</span>`
                        : null}
                      ${template.source_refs.length
                        ? html`<span>Источники: ${template.source_refs.join(', ')}</span>`
                        : null}
                    </div>
                  </td>
                  <td>
                    <div>${template.level?.name ?? '—'}</div>
                    <div class="row-meta">
                      ${template.topic?.name ?? '—'} • ${template.topic?.slug ?? '—'}
                    </div>
                  </td>
                  <td><span class="row-meta">${template.status}</span></td>
                  <td>
                    <div>${template.version}</div>
                    <div class="row-meta">${template.difficulty ?? '—'}</div>
                    <div class="row-meta">${template.updated_at}</div>
                  </td>
                  <td>
                    <div class="actions">
                      <button
                        class="primary"
                        @click=${() => this.publishTemplate(template)}
                      >
                        Publish
                      </button>
                      <button
                        class="secondary"
                        @click=${() => this.openEditForm(template)}
                      >
                        Редактировать
                      </button>
                      <button
                        class="secondary"
                        @click=${() => this.openVersionHistory(template)}
                      >
                        История
                      </button>
                      <button
                        class="secondary"
                        @click=${() => this.revertTemplate(template)}
                      >
                        Revert
                      </button>
                      ${this.renderModerationActions(template)}
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

  private renderFormModal() {
    const title = this.formMode === 'create' ? 'Создать шаблон' : 'Редактировать шаблон';
    return html`
      <div class="modal-overlay">
        <div class="modal">
          <header>
            <h3>${title}</h3>
            <button type="button" @click=${this.closeForm} aria-label="Закрыть">×</button>
          </header>
          <template-form
            .mode=${this.formMode}
            .initialValues=${this.formValues}
            ?submitting=${this.formLoading}
            @form-submit=${this.handleFormSubmit}
            @form-cancel=${this.closeForm}
          ></template-form>
        </div>
      </div>
    `;
  }

  private renderHistoryOverlay() {
    if (!this.showHistoryFor) {
      return null;
    }
    const entries: TemplateVersionHistoryEntry[] = this.versionHistory.map((version) => ({
      version: version.version,
      updatedAt: version.created_at,
      author: version.created_by ?? '—',
      changes: version.changes ?? {},
    }));
    return html`
      <template-version-history
        .open=${true}
        .entries=${entries}
        @close=${this.handleHistoryClose}
        @restore-version=${this.handleRestoreVersion}
      ></template-version-history>
    `;
  }

  private async openVersionHistory(template: AdminTemplateSummary) {
    this.showHistoryFor = template;
    try {
      this.versionHistory = await this.client.listTemplateVersions(template.id);
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось загрузить историю версий';
      this.versionHistory = [];
    }
  }

  private handleHistoryClose() {
    this.showHistoryFor = undefined;
    this.versionHistory = [];
  }

  private handleRestoreVersion(event: CustomEvent<{ version: number }>) {
    event.stopPropagation();
    this.showNotice('Восстановление версии пока требует backend API.', 'error');
  }

  private async openEditForm(template: AdminTemplateSummary) {
    this.formMode = 'edit';
    this.showForm = true;
    this.formLoading = true;
    this.error = undefined;
    try {
      const detail = await this.client.getAdminTemplate(template.id);
      this.editingTemplate = detail;
      this.formValues = this.buildFormValues(detail);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось загрузить шаблон';
      this.showForm = false;
    } finally {
      this.formLoading = false;
    }
  }

  private openCreateForm() {
    this.formMode = 'create';
    this.editingTemplate = undefined;
    this.formValues = undefined;
    this.showForm = true;
  }

  private closeForm() {
    this.showForm = false;
    this.formValues = undefined;
    this.editingTemplate = undefined;
    this.formLoading = false;
  }

  private async handleFormSubmit(event: CustomEvent<TemplateFormValues>) {
    event.stopPropagation();
    this.formLoading = true;
    this.error = undefined;
    const values = event.detail;
    try {
      if (this.formMode === 'create') {
        await this.client.createAdminTemplate(this.buildCreatePayload(values));
        this.showNotice('Шаблон создан. Требуется модерация.', 'success');
      } else if (this.editingTemplate) {
        await this.client.updateAdminTemplate(
          this.editingTemplate.id,
          this.buildUpdatePayload(values),
        );
        this.showNotice('Шаблон обновлён. Статус вернулся в draft.', 'success');
      }
      await this.refreshTemplates();
      this.closeForm();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось сохранить шаблон';
    } finally {
      this.formLoading = false;
    }
  }

  private buildCreatePayload(values: TemplateFormValues) {
    return {
      slug: values.slug,
      level_id: values.levelId,
      rule_ids: values.ruleIds,
      content: values.questionText,
      difficulty: values.difficulty || undefined,
      params: this.buildParams(values),
      metadata: this.buildMetadata(values),
      source_refs: values.sources,
    };
  }

  private buildUpdatePayload(values: TemplateFormValues) {
    return {
      content: values.questionText,
      difficulty: values.difficulty || undefined,
      params: this.buildParams(values),
      metadata: this.buildMetadata(values),
      source_refs: values.sources,
    };
  }

  private buildParams(values: TemplateFormValues) {
    const params: Record<string, unknown> = {};
    if (values.type) {
      params.type = values.type;
    }
    if (values.options.length) {
      params.options = values.options;
    }
    if (values.hintTemplate) {
      params.hint_template = values.hintTemplate;
    }
    if (values.explanationTemplate) {
      params.explanation_template = values.explanationTemplate;
    }
    return params;
  }

  private buildMetadata(values: TemplateFormValues) {
    const metadata: Record<string, unknown> = {
      correct_answer: values.correctAnswer,
    };
    if (values.piiFlags.length) {
      metadata.pii_flags = values.piiFlags;
    }
    return metadata;
  }

  private buildFormValues(detail: AdminTemplateDetail): TemplateFormValues {
    const params = detail.params ?? {};
    const metadata = detail.metadata ?? {};
    const options =
      Array.isArray(params.options) && params.options.length
        ? params.options.map((item) => String(item))
        : [];
    const ruleIds = detail.rule_ids ?? [];
    const sources = detail.source_refs ?? [];
    const difficultyCandidate = detail.difficulty;
    const difficulty =
      difficultyCandidate &&
      ALLOWED_DIFFICULTIES.includes(
        difficultyCandidate as (typeof ALLOWED_DIFFICULTIES)[number],
      )
        ? (difficultyCandidate as TemplateFormValues['difficulty'])
        : '';
    const type = (params.type as string) ?? '';
    const hintTemplate = (params.hint_template as string) ?? '';
    const explanationTemplate = (params.explanation_template as string) ?? '';
    const correctAnswer = (metadata.correct_answer as string) ?? '';
    const piiFlags = Array.isArray(metadata.pii_flags)
      ? (metadata.pii_flags as TemplatePIIFlag[]).filter((flag) =>
          ['email', 'phone', 'name'].includes(flag),
        )
      : [];

    return {
      slug: detail.slug,
      levelId: detail.level?.id ?? '',
      difficulty,
      type: type as TemplateFormValues['type'],
      questionText: detail.content ?? '',
      correctAnswer,
      options,
      ruleIds,
      hintTemplate,
      explanationTemplate,
      sources,
      piiFlags,
    };
  }

  private renderModerationActions(template: AdminTemplateSummary) {
    const isDraft = template.status === 'draft';
    const needsApproval =
      template.status === 'pending_review' || template.status === 'reviewed_once';
    const busy = this.moderationLoadingId === template.id;
    return html`
      ${isDraft
        ? html`
            <button
              class="secondary"
              ?disabled=${busy}
              @click=${() => this.handleSubmitForModeration(template)}
            >
              ${busy ? 'Отправка...' : 'На модерацию'}
            </button>
          `
        : null}
      ${needsApproval
        ? html`
            <button
              class="secondary"
              ?disabled=${busy}
              @click=${() => this.handleApproveTemplate(template)}
            >
              ${busy ? 'Обработка...' : 'Одобрить'}
            </button>
            <button
              class="secondary"
              ?disabled=${busy}
              @click=${() => this.handleRejectTemplate(template)}
            >
              Отклонить
            </button>
          `
        : null}
    `;
  }

  private async handleSubmitForModeration(template: AdminTemplateSummary) {
    if (this.moderationLoadingId === template.id) {
      return;
    }
    this.moderationLoadingId = template.id;
    try {
      await this.client.submitTemplateForModeration(template.id);
      this.showNotice('Шаблон отправлен на модерацию', 'success');
      await this.refreshTemplates();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось отправить на модерацию';
    } finally {
      this.moderationLoadingId = undefined;
    }
  }

  private async handleApproveTemplate(template: AdminTemplateSummary) {
    if (this.moderationLoadingId === template.id) {
      return;
    }
    this.moderationLoadingId = template.id;
    try {
      await this.client.approveTemplate(template.id);
      const stage =
        template.status === 'pending_review' ? 'первое ревью' : 'готовность к публикации';
      this.showNotice(`Шаблон одобрен (${stage})`, 'success');
      await this.refreshTemplates();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось одобрить';
    } finally {
      this.moderationLoadingId = undefined;
    }
  }

  private async handleRejectTemplate(template: AdminTemplateSummary) {
    if (this.moderationLoadingId === template.id) {
      return;
    }
    const reason = window.prompt('Укажите причину отклонения')?.trim();
    if (!reason) {
      return;
    }
    this.moderationLoadingId = template.id;
    try {
      await this.client.rejectTemplate(template.id, { reason });
      this.showNotice('Шаблон отклонён и вернулся в draft', 'success');
      await this.refreshTemplates();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось отклонить';
    } finally {
      this.moderationLoadingId = undefined;
    }
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

  private async refreshTemplates() {
    this.loading = true;
    this.error = undefined;
    try {
      this.templates = await this.client.listAdminTemplates(this.filter);
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось загрузить шаблоны';
    } finally {
      this.loading = false;
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

  private async publishTemplate(template: AdminTemplateSummary) {
    try {
      await this.client.updateAdminTemplate(template.id, { status: 'published' });
      this.showNotice('Шаблон опубликован', 'success');
      await this.refreshTemplates();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось опубликовать';
    }
  }

  private async revertTemplate(template: AdminTemplateSummary) {
    const reason = window.prompt('Причина возврата в draft?')?.trim();
    if (!reason) {
      return;
    }
    try {
      await this.client.revertAdminTemplate(template.id, { reason });
      this.showNotice('Шаблон переведён в draft', 'success');
      await this.refreshTemplates();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось откатить шаблон';
    }
  }
}
