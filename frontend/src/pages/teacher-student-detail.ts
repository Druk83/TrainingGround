import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type { TeacherStudentDetail } from '@/lib/api-types';
import '@/components/app-header';

@customElement('teacher-student-detail')
export class TeacherStudentDetailPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .page {
      max-width: 1000px;
      margin: 0 auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.8rem, 3vw, 2.4rem);
    }

    .muted {
      color: var(--text-muted);
      margin: 0.25rem 0 0;
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }

    .grid div span {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .grid div strong {
      font-size: 1.2rem;
    }

    .table-wrapper {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      overflow-x: auto;
      box-shadow: var(--shadow-soft);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .back-link {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
    }
  `;

  @state() private detail?: TeacherStudentDetail;
  @state() private loading = true;
  @state() private error?: string;

  private client: ApiClient;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchDetail();
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header>
          <div>
            <h1>Карточка ученика</h1>
            <p class="muted">Детальная статистика и прогресс по темам.</p>
          </div>
          <a class="back-link" href=${this.backLink}>← Назад к списку</a>
        </header>
        ${this.loading
          ? html`<div class="card"><p class="muted">Загрузка...</p></div>`
          : this.error
            ? html`<div class="card"><p class="muted">${this.error}</p></div>`
            : this.detail
              ? html`
                  <div class="card">
                    <div class="grid">
                      <div>
                        <span>Имя</span>
                        <strong>${this.detail.summary.name}</strong>
                      </div>
                      <div>
                        <span>Email</span>
                        <strong>${this.detail.summary.email}</strong>
                      </div>
                      <div>
                        <span>Точность</span>
                        <strong
                          >${this.detail.summary.accuracy?.toFixed(1) ?? '—'}%</strong
                        >
                      </div>
                      <div>
                        <span>Попыток</span>
                        <strong>${this.detail.summary.total_attempts ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Сумма баллов</span>
                        <strong>${this.detail.summary.total_score ?? '—'}</strong>
                      </div>
                      <div>
                        <span>Последний прогресс</span>
                        <strong>
                          ${this.detail.summary.last_progress_at
                            ? new Date(
                                this.detail.summary.last_progress_at,
                              ).toLocaleDateString()
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div class="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Уровень</th>
                          <th>Попыток</th>
                          <th>Точность</th>
                          <th>Баллы</th>
                          <th>Обновлено</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${this.detail.progress.map(
                          (row) => html`
                            <tr>
                              <td>${row.level_id}</td>
                              <td>${row.attempts_total}</td>
                              <td>${row.percentage.toFixed(1)}%</td>
                              <td>${row.score}</td>
                              <td>${new Date(row.updated_at).toLocaleDateString()}</td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                `
              : null}
      </div>
    `;
  }

  private get backLink() {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('groupId');
    return groupId ? `/teacher/students?groupId=${groupId}` : '/teacher/students';
  }

  private async fetchDetail() {
    const studentId = this.extractStudentId();
    const groupId = new URLSearchParams(window.location.search).get('groupId');
    if (!studentId || !groupId) {
      this.error = 'Не найден идентификатор ученика или группы.';
      this.loading = false;
      return;
    }
    try {
      this.detail = await this.client.getTeacherStudentDetail(groupId, studentId);
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private extractStudentId() {
    const parts = window.location.pathname.split('/');
    return parts.length >= 4 ? parts[3] : null;
  }
}
