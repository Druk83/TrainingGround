import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  CreateNotificationTemplatePayload,
  GroupResponse,
  NotificationHistoryEntry,
  NotificationTemplate,
} from '@/lib/api-types';
import '@/components/app-header';

@customElement('teacher-notifications')
export class TeacherNotificationsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.75rem, 3vw, 2.4rem);
    }

    .muted {
      color: var(--text-muted);
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
    }

    .action-link {
      display: inline-flex;
      padding: 0.5rem 0.9rem;
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.2);
      text-decoration: none;
      color: inherit;
      font-weight: 600;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    select,
    textarea,
    input[type='text'] {
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      font-family: inherit;
      padding: 0.6rem 0.75rem;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
    }

    button {
      border-radius: var(--radius-small);
      border: none;
      padding: 0.7rem 1.2rem;
      font-weight: 600;
      cursor: pointer;
      background: var(--primary);
      color: #fff;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .status {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    th,
    td {
      padding: 0.65rem 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
    }

    th {
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .template-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .template-item {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-small);
      padding: 0.8rem;
    }

    .template-item h4 {
      margin: 0;
      font-size: 1rem;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      margin-top: 1rem;
    }

    @media (max-width: 720px) {
      .page {
        padding: 1rem;
      }
    }
  `;

  @state() private groups: GroupResponse[] = [];
  @state() private templates: NotificationTemplate[] = [];
  @state() private history: NotificationHistoryEntry[] = [];
  @state() private selectedGroupId: string | null = null;
  @state() private selectedTemplateId: string | null = null;
  @state() private loading = true;
  @state() private sending = false;
  @state() private creating = false;
  @state() private statusMessage?: string;
  @state() private templateForm: CreateNotificationTemplatePayload = {
    name: '',
    subject: '',
    body: '',
  };
  @state() private error?: string;

  private client: ApiClient;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadInitialData();
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header>
          <div>
            <h1>Уведомления ученикам</h1>
            <p class="muted">
              Используйте шаблоны с переменными вроде {student_name} и {group_name}.
            </p>
          </div>
          <a class="action-link" href="/teacher-dashboard">← Назад к дашборду</a>
        </header>
        ${this.error ? html`<div class="card error">Ошибка: ${this.error}</div>` : null}
        ${this.renderSendCard()}
        <div class="grid">${this.renderTemplateManager()} ${this.renderHistory()}</div>
      </div>
    `;
  }

  private renderSendCard() {
    const disabled =
      this.loading || this.sending || !this.selectedGroupId || !this.selectedTemplateId;
    return html`
      <div class="card">
        <h2>Отправить уведомление</h2>
        <div class="grid">
          <label>
            Группа
            <select
              @change=${(event: Event) =>
                (this.selectedGroupId = (event.currentTarget as HTMLSelectElement).value)}
            >
              ${this.groups.map(
                (group) => html`
                  <option
                    value=${group.id}
                    ?selected=${group.id === this.selectedGroupId}
                  >
                    ${group.name}
                  </option>
                `,
              )}
            </select>
          </label>
          <label>
            Шаблон
            <select
              @change=${(event: Event) =>
                (this.selectedTemplateId = (
                  event.currentTarget as HTMLSelectElement
                ).value)}
            >
              ${this.templates.map(
                (template) => html`
                  <option
                    value=${template.id}
                    ?selected=${template.id === this.selectedTemplateId}
                  >
                    ${template.name}
                  </option>
                `,
              )}
            </select>
          </label>
        </div>
        <button ?disabled=${disabled} @click=${this.onSendNotification}>
          ${this.sending ? 'Отправка...' : 'Отправить всем ученикам группы'}
        </button>
        ${this.statusMessage ? html`<p class="status">${this.statusMessage}</p>` : null}
      </div>
    `;
  }

  private renderTemplateManager() {
    return html`
      <div class="card">
        <h2>Шаблоны писем</h2>
        ${this.templates.length
          ? html`
              <div class="template-list">
                ${this.templates.map(
                  (template) => html`
                    <div class="template-item">
                      <h4>${template.name}</h4>
                      <p class="muted">${template.subject}</p>
                      <p>${template.body}</p>
                    </div>
                  `,
                )}
              </div>
            `
          : html`<p class="muted">Шаблонов пока нет.</p>`}
        <h3>Новый шаблон</h3>
        <form @submit=${this.onCreateTemplate}>
          <label>
            Название
            <input
              type="text"
              .value=${this.templateForm.name}
              required
              @input=${(event: Event) =>
                (this.templateForm = {
                  ...this.templateForm,
                  name: (event.currentTarget as HTMLInputElement).value,
                })}
            />
          </label>
          <label>
            Тема письма
            <input
              type="text"
              .value=${this.templateForm.subject}
              required
              @input=${(event: Event) =>
                (this.templateForm = {
                  ...this.templateForm,
                  subject: (event.currentTarget as HTMLInputElement).value,
                })}
            />
          </label>
          <label>
            Текст письма
            <textarea
              .value=${this.templateForm.body}
              required
              @input=${(event: Event) =>
                (this.templateForm = {
                  ...this.templateForm,
                  body: (event.currentTarget as HTMLTextAreaElement).value,
                })}
            ></textarea>
          </label>
          <button type="submit" ?disabled=${this.creating}>
            ${this.creating ? 'Сохранение...' : 'Сохранить шаблон'}
          </button>
        </form>
      </div>
    `;
  }

  private renderHistory() {
    return html`
      <div class="card">
        <h2>История отправок</h2>
        ${this.history.length
          ? html`
              <div class="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Шаблон</th>
                      <th>Тема</th>
                      <th>Получателей</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.history.map(
                      (entry) => html`
                        <tr>
                          <td>${new Date(entry.sent_at).toLocaleString()}</td>
                          <td>${entry.template_name ?? '—'}</td>
                          <td>${entry.subject}</td>
                          <td>${entry.recipientsCount}</td>
                          <td>${entry.status}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `
          : html`<p class="muted">Отправок пока не было.</p>`}
      </div>
    `;
  }

  private async loadInitialData() {
    this.loading = true;
    this.error = undefined;
    try {
      const [groups, templates, history] = await Promise.all([
        this.client.listTeacherGroups(),
        this.client.listTeacherNotificationTemplates(),
        this.client.listTeacherNotificationHistory(),
      ]);
      this.groups = groups;
      if (!this.selectedGroupId) {
        this.selectedGroupId = groups[0]?.id ?? null;
      }
      this.templates = templates;
      if (!this.selectedTemplateId) {
        this.selectedTemplateId = templates[0]?.id ?? null;
      }
      this.history = history;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async loadHistory() {
    try {
      this.history = await this.client.listTeacherNotificationHistory();
    } catch (error) {
      this.statusMessage = `Не удалось обновить историю: ${(error as Error).message}`;
    }
  }

  private async onSendNotification() {
    if (!this.selectedGroupId || !this.selectedTemplateId) {
      this.statusMessage = 'Выберите группу и шаблон.';
      return;
    }
    this.sending = true;
    this.statusMessage = undefined;
    try {
      const response = await this.client.sendTeacherNotification({
        group_id: this.selectedGroupId,
        template_id: this.selectedTemplateId,
      });
      this.statusMessage = response.email_disabled
        ? 'Отправка отключена в настройках сервера.'
        : `Отправлено ученикам: ${response.sent}`;
      await this.loadHistory();
    } catch (error) {
      this.statusMessage = `Ошибка отправки: ${(error as Error).message}`;
    } finally {
      this.sending = false;
    }
  }

  private async onCreateTemplate(event: Event) {
    event.preventDefault();
    if (
      !this.templateForm.name ||
      !this.templateForm.subject ||
      !this.templateForm.body
    ) {
      return;
    }
    this.creating = true;
    try {
      const template = await this.client.createTeacherNotificationTemplate({
        name: this.templateForm.name,
        subject: this.templateForm.subject,
        body: this.templateForm.body,
      });
      this.templates = [template, ...this.templates];
      this.selectedTemplateId = template.id;
      this.templateForm = { name: '', subject: '', body: '' };
    } catch (error) {
      this.statusMessage = `Ошибка сохранения: ${(error as Error).message}`;
    } finally {
      this.creating = false;
    }
  }
}
