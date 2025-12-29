import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type { AdminTemplateSummary } from '@/lib/api-types';

interface QualityIssue {
  id: string;
  title: string;
  detail: string;
  severity: 'warning' | 'error';
}

interface DuplicateEntry {
  templateA: AdminTemplateSummary;
  templateB: AdminTemplateSummary;
  similarity: number;
  id: string;
}

@customElement('content-quality')
export class ContentQuality extends LitElement {
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
      gap: 1rem;
    }

    h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.7rem;
    }

    .metric-card {
      padding: 0.9rem 1rem;
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: var(--surface-3);
    }

    .metric-card span {
      display: block;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.55rem 1rem;
      font-weight: 600;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      color: #fff;
      border-color: transparent;
    }

    .issues {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .issue {
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-large);
      padding: 0.75rem 1rem;
      background: var(--surface-3);
    }

    .issue strong {
      display: block;
    }

    .row-meta {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }

    .duplicates table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.6rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    @media (max-width: 640px) {
      .metrics {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
    }
  `;

  private readonly client = new ApiClient({
    jwt: authService.getToken() ?? undefined,
  });
  @state() private templates: AdminTemplateSummary[] = [];
  @state() private issues: QualityIssue[] = [];
  @state() private duplicates: DuplicateEntry[] = [];
  @state() private loading = false;
  @state() private validating = false;
  @state() private error?: string;

  connectedCallback() {
    super.connectedCallback();
    this.loadTemplates();
  }

  render() {
    const statuses = this.groupByStatus();
    const draftCount = statuses.draft ?? 0;
    const readyCount = statuses.ready ?? 0;
    const publishedCount = statuses.published ?? 0;
    const deprecatedCount = statuses.deprecated ?? 0;

    return html`
      <section class="panel">
        <div class="header">
          <div>
            <h2>Мониторинг качества</h2>
            <p class="row-meta">Метрики, проверка синтаксиса и дубликатов</p>
          </div>
        </div>
        <div class="metrics">
          <div class="metric-card">
            <strong>Шаблонов всего</strong>
            <span>${this.templates.length}</span>
          </div>
          <div class="metric-card">
            <strong>Draft</strong>
            <span>${draftCount}</span>
          </div>
          <div class="metric-card">
            <strong>Ready</strong>
            <span>${readyCount}</span>
          </div>
          <div class="metric-card">
            <strong>Published</strong>
            <span>${publishedCount}</span>
          </div>
          <div class="metric-card">
            <strong>Deprecated</strong>
            <span>${deprecatedCount}</span>
          </div>
        </div>
        <div class="actions">
          <button
            class="primary"
            @click=${this.runValidation}
            ?disabled=${this.validating}
          >
            ${this.validating ? 'Проверка...' : 'Проверить все шаблоны'}
          </button>
          <button @click=${this.detectDuplicates}>Обнаружить дубликаты</button>
        </div>

        ${this.error ? html`<div class="issue">Ошибка: ${this.error}</div>` : null}
        ${this.issues.length
          ? html`
              <div class="issues">
                ${this.issues.map(
                  (issue) => html`
                    <article class="issue">
                      <strong>${issue.title}</strong>
                      <p class="row-meta">${issue.detail}</p>
                    </article>
                  `,
                )}
              </div>
            `
          : html`<p class="row-meta">Проблем не найдено. Запустите проверку.</p>`}
        ${this.duplicates.length
          ? html`
              <div class="duplicates">
                <h3>Потенциальные дубликаты</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Шаблон 1</th>
                      <th>Шаблон 2</th>
                      <th>Схожесть</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.duplicates.map(
                      (entry) => html`
                        <tr>
                          <td>${entry.templateA.slug}</td>
                          <td>${entry.templateB.slug}</td>
                          <td>${entry.similarity}%</td>
                          <td>
                            <button
                              class="secondary"
                              @click=${() => this.markUnique(entry.id)}
                            >
                              Отметить уникальными
                            </button>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `
          : null}
      </section>
    `;
  }

  private groupByStatus() {
    return this.templates.reduce<Record<string, number>>((acc, template) => {
      acc[template.status] = (acc[template.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  private async loadTemplates() {
    this.loading = true;
    this.error = undefined;
    try {
      this.templates = await this.client.listAdminTemplates();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось загрузить шаблоны';
    } finally {
      this.loading = false;
    }
  }

  private async runValidation() {
    this.validating = true;
    this.error = undefined;
    try {
      const issues = await this.client.validateTemplates();
      this.issues = issues.map((issue) => ({
        id: issue.template_id,
        title: issue.reason,
        detail: `${issue.slug} • ${issue.severity}`,
        severity: issue.severity === 'error' ? 'error' : 'warning',
      }));
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Не удалось запустить проверку';
    } finally {
      this.validating = false;
    }
  }

  private async detectDuplicates() {
    this.error = undefined;
    try {
      const raw = await this.client.listDuplicates();
      this.duplicates = raw.map((dup) => ({
        templateA: this.templates.find((tpl) => tpl.slug === dup.template_a) ?? {
          id: 'unknown',
          slug: dup.template_a,
          status: 'draft',
          version: 0,
          pii_flags: [],
          source_refs: [],
          updated_at: '',
        },
        templateB: this.templates.find((tpl) => tpl.slug === dup.template_b) ?? {
          id: 'unknown',
          slug: dup.template_b,
          status: 'draft',
          version: 0,
          pii_flags: [],
          source_refs: [],
          updated_at: '',
        },
        similarity: dup.similarity,
        id: `${dup.template_a}-${dup.template_b}`,
      }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось найти дубликаты';
    }
  }

  private markUnique(entryId: string) {
    this.duplicates = this.duplicates.filter((entry) => entry.id !== entryId);
  }
}
