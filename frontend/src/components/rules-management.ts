import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { ApiClient } from '@/lib/api-client';
import type { RuleCoverage, RuleCreatePayload, RuleSummary } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

@customElement('rules-management')
export class RulesManagement extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    section {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
    }

    header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
    }

    .rule-card {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-large);
      padding: 1rem;
      background: var(--surface-3);
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.45rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      color: #fff;
      border-color: transparent;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.5rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    input,
    textarea {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.4rem 0.8rem;
      font: inherit;
    }

    textarea {
      resize: vertical;
    }

    .coverage {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--surface-3);
      padding: 1rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.5rem;
    }

    .coverage-card {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .markdown-area {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.5rem;
      align-items: stretch;
    }

    .markdown-panel {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--surface-3);
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      min-height: 220px;
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .preview-body {
      flex: 1;
      overflow: auto;
      font-size: 0.9rem;
      line-height: 1.4;
    }

    .preview-body ul {
      margin: 0.4rem 0 0.4rem 1rem;
    }

    .preview-placeholder {
      color: var(--text-muted);
      font-style: italic;
      font-size: 0.85rem;
    }

    .row-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    code {
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      user-select: all;
      cursor: text;
    }
  `;

  private readonly client = new ApiClient({ jwt: authService.getToken() ?? undefined });
  @state() declare private rules: RuleSummary[];
  @state() declare private coverage: RuleCoverage[];
  @state() declare private creating: boolean;
  @state() declare private errors?: string;
  @state() declare private newRule: RuleCreatePayload;
  @state() declare private previewHtml: string;

  constructor() {
    super();
    this.rules = [];
    this.coverage = [];
    this.creating = false;
    this.newRule = {
      slug: '',
      name: '',
      category: '',
      description: '',
    };
    this.previewHtml = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadRules();
    this.loadCoverage();
  }

  render() {
    return html`
      <section>
        <header>
          <div>
            <h2>Правила русского языка</h2>
            <p class="row-meta">Правила, примеры и покрытие по шаблонам.</p>
          </div>
          <button class="primary" @click=${this.loadRules}>Обновить</button>
        </header>
        <div class="form-grid">
          <label>
            Slug
            <input
              type="text"
              .value=${this.newRule.slug}
              @input=${(event: Event) =>
                (this.newRule = {
                  ...this.newRule,
                  slug: (event.currentTarget as HTMLInputElement).value,
                })}
              placeholder="vowel-o-a"
            />
          </label>
          <label>
            Название
            <input
              type="text"
              .value=${this.newRule.name}
              @input=${(event: Event) =>
                (this.newRule = {
                  ...this.newRule,
                  name: (event.currentTarget as HTMLInputElement).value,
                })}
            />
          </label>
          <label>
            Категория
            <input
              type="text"
              .value=${this.newRule.category}
              @input=${(event: Event) =>
                (this.newRule = {
                  ...this.newRule,
                  category: (event.currentTarget as HTMLInputElement).value,
                })}
            />
          </label>
        </div>
        <div class="markdown-area">
          <label>
            Описание
            <textarea
              rows="4"
              .value=${this.newRule.description}
              @input=${(event: Event) =>
                this.handleDescriptionInput(
                  (event.currentTarget as HTMLTextAreaElement).value,
                )}
            ></textarea>
          </label>
          <div class="markdown-panel">
            <div class="preview-header">
              <span>Предпросмотр</span>
            </div>
            <div class="preview-body">
              ${this.previewHtml
                ? unsafeHTML(this.previewHtml)
                : html`<p class="preview-placeholder">
                    Введите описание правила — предпросмотр появится здесь.
                  </p>`}
            </div>
          </div>
        </div>
        <button
          class="primary"
          @click=${this.handleCreateRule}
          ?disabled=${this.creating}
        >
          ${this.creating ? 'Сохраняем...' : 'Создать правило'}
        </button>
        ${this.errors ? html`<p class="row-meta">${this.errors}</p>` : null}
        ${this.renderRules()} ${this.renderCoverage()}
      </section>
    `;
  }

  private renderRules() {
    if (!this.rules.length) {
      return html`<p class="row-meta">Правил пока нет.</p>`;
    }
    return html`
      <div class="grid">
        ${this.rules.map(
          (rule) => html`
            <article class="rule-card">
              <div>
                <strong>${rule.name}</strong>
                <span class="row-meta">${rule.category} • ${rule.status}</span>
              </div>
              <p class="row-meta">ID: <code>${rule.id}</code></p>
              <p>${rule.description}</p>
              <p class="row-meta">Примеры: ${rule.examples.join('; ') || '—'}</p>
              <p class="row-meta">
                Связано шаблонов: ${rule.sources.length ? rule.sources.join('; ') : '—'}
              </p>
              <div class="actions">
                <button @click=${() => this.toggleRuleStatus(rule)}>Статус</button>
              </div>
            </article>
          `,
        )}
      </div>
    `;
  }

  private renderCoverage() {
    if (!this.coverage.length) {
      return html`<p class="row-meta">Данные покрытия ещё не загружены.</p>`;
    }
    return html`
      <div class="coverage">
        ${this.coverage.map(
          (entry) => html`
            <div class="coverage-card">
              <strong>${entry.rule_id}</strong>
              <span>Шаблонов: ${entry.linked_templates}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  private async loadRules() {
    try {
      this.rules = await this.client.listRules();
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось загрузить правила';
    }
  }

  private async loadCoverage() {
    try {
      this.coverage = await this.client.getRuleCoverage();
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось загрузить покрытие';
    }
  }

  private async handleCreateRule() {
    if (
      !this.newRule.slug ||
      !this.newRule.name ||
      !this.newRule.category ||
      !this.newRule.description
    ) {
      return;
    }
    this.creating = true;
    try {
      await this.client.createRule(this.newRule);
      this.newRule = { slug: '', name: '', category: '', description: '' };
      this.previewHtml = '';
      await Promise.all([this.loadRules(), this.loadCoverage()]);
    } catch (error) {
      this.errors = error instanceof Error ? error.message : 'Не удалось создать правило';
    } finally {
      this.creating = false;
    }
  }

  private handleDescriptionInput(value: string) {
    this.newRule = { ...this.newRule, description: value };
    this.updatePreview(value);
  }

  private updatePreview(value: string) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      this.previewHtml = '';
      return;
    }
    const parsed: string | Promise<string> = marked.parse(value);
    if (typeof parsed === 'string') {
      this.previewHtml = DOMPurify.sanitize(parsed);
      return;
    }
    this.previewHtml = '';
    parsed.then((result: string) => {
      this.previewHtml = DOMPurify.sanitize(result);
    });
  }

  private async toggleRuleStatus(rule: RuleSummary) {
    const nextStatus = rule.status === 'active' ? 'deprecated' : 'active';
    try {
      await this.client.updateRule(rule.id, { status: nextStatus });
      await this.loadRules();
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось обновить правило';
    }
  }
}
