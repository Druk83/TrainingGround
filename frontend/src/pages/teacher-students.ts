import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import type { GroupResponse, TeacherStudentSummary } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

@customElement('teacher-students')
export class TeacherStudentsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.8rem, 3vw, 2.4rem);
    }

    .muted {
      color: var(--text-muted);
      margin: 0.25rem 0 0;
    }

    .controls {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
    }

    label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    select,
    input[type='search'] {
      border-radius: var(--radius-small);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 0.5rem 0.85rem;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      font-family: inherit;
      min-width: 200px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .summary-card {
      background: var(--surface-2);
      border-radius: var(--radius-medium);
      padding: 1rem;
      box-shadow: var(--shadow-soft);
    }

    .summary-card span {
      display: block;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .summary-card strong {
      font-size: 1.5rem;
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
      min-width: 640px;
    }

    th,
    td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .actions a {
      text-decoration: none;
      color: var(--primary);
      font-weight: 600;
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-medium);
    }
  `;

  @state() declare private groups: GroupResponse[];
  @state() declare private students: TeacherStudentSummary[];
  @state() declare private selectedGroupId: string | null;
  @state() declare private loading: boolean;
  @state() declare private groupLoading: boolean;
  @state() declare private error?: string;
  @state() declare private searchTerm: string;

  private client: ApiClient;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
    this.groups = [];
    this.students = [];
    this.selectedGroupId = null;
    this.loading = false;
    this.groupLoading = false;
    this.searchTerm = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadGroups();
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <header>
          <div>
            <h1>Список учеников</h1>
            <p class="muted">Выбери группу и отслеживай прогресс учеников.</p>
          </div>
          <div class="controls">
            <label>
              Группа
              <select
                @change=${this.onGroupChange}
                .value=${this.selectedGroupId ?? ''}
                ?disabled=${this.groupLoading || !this.groups.length}
              >
                <option value="" disabled ?selected=${!this.selectedGroupId}>
                  Выберите группу
                </option>
                ${this.groups.map(
                  (group) => html`<option value=${group.id}>${group.name}</option>`,
                )}
              </select>
            </label>
            <label>
              Поиск
              <input
                type="search"
                placeholder="Имя или email"
                .value=${this.searchTerm}
                @input=${(event: Event) =>
                  (this.searchTerm = (event.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
        </header>
        ${this.error ? html`<div class="empty">${this.error}</div>` : null}
        <div class="summary">
          <div class="summary-card">
            <span>Всего учеников</span>
            <strong>${this.students.length}</strong>
          </div>
          <div class="summary-card">
            <span>Средняя точность</span>
            <strong>${this.getAverageAccuracy()}%</strong>
          </div>
          <div class="summary-card">
            <span>Средний балл</span>
            <strong>${this.getAverageScore()}</strong>
          </div>
        </div>
        <div class="table-wrapper">
          ${this.loading
            ? html`<div class="empty">Загрузка учеников...</div>`
            : this.renderTable()}
        </div>
      </div>
    `;
  }

  private renderTable() {
    const rows = this.filteredStudents;
    if (!rows.length) {
      return html`<div class="empty">Нет данных по выбранной группе.</div>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Имя</th>
            <th>Email</th>
            <th>Точность</th>
            <th>Попыток</th>
            <th>Баллы</th>
            <th>Последний прогресс</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (student) => html`
              <tr>
                <td>${student.name}</td>
                <td>${student.email}</td>
                <td>${student.accuracy?.toFixed(1) ?? '—'}%</td>
                <td>${student.total_attempts ?? '—'}</td>
                <td>${student.total_score ?? '—'}</td>
                <td>
                  ${student.last_progress_at
                    ? new Date(student.last_progress_at).toLocaleDateString()
                    : '—'}
                </td>
                <td class="actions">
                  <a href=${this.getStudentDetailUrl(student.id)}>Открыть</a>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  private get filteredStudents() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      return this.students;
    }
    return this.students.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term),
    );
  }

  private getAverageAccuracy() {
    const values = this.students
      .map((student) => student.accuracy)
      .filter((value): value is number => typeof value === 'number');
    if (!values.length) {
      return '—';
    }
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return average.toFixed(1);
  }

  private getAverageScore() {
    const values = this.students
      .map((student) => student.total_score)
      .filter((value): value is number => typeof value === 'number');
    if (!values.length) {
      return '—';
    }
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return average.toFixed(0);
  }

  private getStudentDetailUrl(studentId: string) {
    if (!this.selectedGroupId) {
      return `/teacher/students/${studentId}`;
    }
    const params = new URLSearchParams();
    params.set('groupId', this.selectedGroupId);
    return `/teacher/students/${studentId}?${params.toString()}`;
  }

  private async loadGroups() {
    this.groupLoading = true;
    this.error = undefined;
    try {
      this.groups = await this.client.listTeacherGroups();
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('groupId');
      const candidate =
        requested && this.groups.some((group) => group.id === requested)
          ? requested
          : (this.groups[0]?.id ?? null);
      this.selectedGroupId = candidate;
      if (this.selectedGroupId) {
        await this.loadStudents();
      }
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.groupLoading = false;
    }
  }

  private async loadStudents() {
    if (!this.selectedGroupId) {
      return;
    }
    this.loading = true;
    this.error = undefined;
    try {
      this.students = await this.client.listTeacherGroupStudents(this.selectedGroupId);
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private onGroupChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    if (target.value !== this.selectedGroupId) {
      this.selectedGroupId = target.value;
      this.loadStudents();
    }
  }
}
