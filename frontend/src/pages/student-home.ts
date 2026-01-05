import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import { lessonStore } from '@/lib/session-store';
import '@/components/app-header';

import type { StudentCourseSummary } from '@/lib/api-types';

type Course = StudentCourseSummary;

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
type StatusFilter = 'all' | 'new' | 'in_progress' | 'completed';

@customElement('student-home')
export class StudentHome extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }

    .header {
      margin-bottom: 2rem;
    }

    .header h1 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
      color: var(--text-main);
    }

    .header p {
      margin: 0;
      color: var(--text-muted);
      font-size: 1rem;
    }

    .welcome {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: var(--radius-large, 12px);
      margin-bottom: 2rem;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
    }

    .welcome h2 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }

    .welcome p {
      margin: 0;
      opacity: 0.9;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .filter-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    select {
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-color, #3a3a3a);
      border-radius: var(--radius-medium, 8px);
      background: var(--surface-2);
      color: var(--text-main);
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    select:focus {
      outline: none;
      border-color: #667eea;
    }

    .courses-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .error {
      margin-bottom: 1rem;
      padding: 1rem 1.25rem;
      border-radius: var(--radius-medium, 8px);
      background: rgba(255, 99, 71, 0.1);
      border: 1px solid rgba(255, 99, 71, 0.3);
      color: #ffd1c7;
    }

    .course-card {
      background: var(--surface-2);
      border-radius: var(--radius-large, 12px);
      padding: 1.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      transition:
        transform 0.2s,
        box-shadow 0.2s;
      cursor: pointer;
      border: 2px solid transparent;
    }

    .course-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      border-color: #667eea;
    }

    .course-card.in-progress {
      border-color: rgba(102, 126, 234, 0.3);
    }

    .course-card.completed {
      border-color: rgba(68, 255, 68, 0.3);
    }

    .course-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 1rem;
    }

    .course-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-main);
      margin: 0 0 0.5rem;
    }

    .difficulty-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .difficulty-easy {
      background: #44ff44;
      color: #000;
    }

    .difficulty-medium {
      background: #ffaa44;
      color: #000;
    }

    .difficulty-hard {
      background: #ff4444;
      color: white;
    }

    .course-description {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1rem;
    }

    .course-stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: var(--surface-1);
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
      border-radius: 999px;
    }

    .course-actions {
      display: flex;
      gap: 0.5rem;
    }

    button {
      flex: 1;
      padding: 0.75rem 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: var(--radius-medium, 8px);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
      font-family: inherit;
    }

    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background: var(--surface-3, #3a3a3a);
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .empty-state h3 {
      margin: 0 0 1rem;
      font-size: 1.5rem;
      color: var(--text-main);
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
    }

    .status-new {
      background: #667eea;
      color: white;
    }

    .status-in_progress {
      background: #ffaa44;
      color: #000;
    }

    .status-completed {
      background: #44ff44;
      color: #000;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding: 1rem;
      background: var(--surface-2);
      border-radius: var(--radius-large, 12px);
    }

    .top-bar button {
      flex: 0 0 auto;
      min-width: 120px;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem 0.5rem;
      }

      .header h1 {
        font-size: 1.5rem;
      }

      .courses-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
      }

      .top-bar {
        flex-direction: column;
        gap: 1rem;
      }

      .top-bar button {
        width: 100%;
      }
    }
  `;

  private api = new ApiClient();
  @state() declare private courses: Course[];
  @state() declare private difficultyFilter: DifficultyFilter;
  @state() declare private statusFilter: StatusFilter;
  @state() declare private loading: boolean;
  @state() declare private error?: string;
  @state() declare private actionCourseId?: string;

  constructor() {
    super();
    this.courses = [];
    this.difficultyFilter = 'all';
    this.statusFilter = 'all';
    this.loading = false;
  }

  private ensureLessonStoreUser(tokenOverride?: string | null) {
    const storeUser = lessonStore.snapshot.user;
    const authUser = authService.getUser();
    if (!authUser) {
      return;
    }
    const nextToken = tokenOverride ?? authService.getToken() ?? undefined;
    if (storeUser.id === authUser.id && storeUser.token && !tokenOverride) {
      return;
    }
    lessonStore.setUser({
      id: authUser.id,
      groupId: authUser.group_ids?.[0],
      token: nextToken,
    });
  }

  connectedCallback() {
    super.connectedCallback();
    void this.initialize();
  }

  private async initialize() {
    let token = authService.getToken();
    if (!token || this.isTokenExpired(token)) {
      try {
        token = await authService.refreshToken();
      } catch (error) {
        console.error('Failed to refresh token before loading courses', error);
        this.error = 'Не удалось обновить сессию. Войдите снова.';
      }
    }

    if (!token) {
      return;
    }

    this.api.setToken(token);
    this.ensureLessonStoreUser(token);
    await this.loadCourses();
  }

  private isTokenExpired(token: string) {
    try {
      const [, payloadBase64] = token.split('.');
      const payload = JSON.parse(atob(payloadBase64 ?? ''));
      if (!payload?.exp) {
        return false;
      }
      const expiresAt = payload.exp * 1000;
      const safetyWindowMs = 10_000;
      return Date.now() + safetyWindowMs >= expiresAt;
    } catch {
      return false;
    }
  }

  private async loadCourses() {
    this.loading = true;
    this.error = undefined;

    try {
      const response = await this.api.listStudentCourses();
      this.courses = response.courses ?? [];
      lessonStore.setCourses(this.courses);
    } catch (error) {
      console.error('Failed to load courses', error);
      this.error = (error as Error).message;
      this.courses = [];
    } finally {
      this.loading = false;
    }
  }
  private get filteredCourses(): Course[] {
    return this.courses.filter((course) => {
      const matchesDifficulty =
        this.difficultyFilter === 'all' || course.difficulty === this.difficultyFilter;
      const matchesStatus =
        this.statusFilter === 'all' || course.status === this.statusFilter;
      return matchesDifficulty && matchesStatus;
    });
  }

  private async mountAppShell() {
    if (!customElements.get('app-shell')) {
      await import('../app-shell');
    }
  }

  private handleDifficultyFilterChange(e: Event) {
    this.difficultyFilter = (e.target as HTMLSelectElement).value as DifficultyFilter;
  }

  private handleStatusFilterChange(e: Event) {
    this.statusFilter = (e.target as HTMLSelectElement).value as StatusFilter;
  }

  private handleStartCourse(courseId: string) {
    void this.launchCourse(courseId);
  }

  private handleContinueCourse(courseId: string, _sessionId?: string) {
    void this.launchCourse(courseId);
  }

  private async launchCourse(courseId: string) {
    let token = authService.getToken();
    if (!token || this.isTokenExpired(token)) {
      try {
        token = await authService.refreshToken();
        if (token) {
          this.api.setToken(token);
          this.ensureLessonStoreUser(token);
        }
      } catch (error) {
        console.error('Failed to refresh token before starting course', error);
        this.error = 'Не удалось обновить сессию. Войдите снова.';
        return;
      }
    }

    const course = this.courses.find((item) => item.id === courseId);
    if (!course) {
      return;
    }

    this.actionCourseId = courseId;
    try {
      await lessonStore.startCourseSession(course);
      if (lessonStore.snapshot.activeSession) {
        await this.mountAppShell();
        this.remove();
      }
    } catch (error) {
      console.error('Failed to start course session', error);
      this.error = (error as Error).message;
    } finally {
      this.actionCourseId = undefined;
    }
  }

  private handleViewProfile() {
    window.location.href = '/profile';
  }

  private getDifficultyLabel(difficulty: string): string {
    const labels: Record<string, string> = {
      easy: 'Лёгкий',
      medium: 'Средний',
      hard: 'Сложный',
    };
    return labels[difficulty] || difficulty;
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      new: 'Новый',
      in_progress: 'В процессе',
      completed: 'Завершён',
    };
    return labels[status] || status;
  }

  render() {
    const user = authService.getUser();

    if (!user) {
      return html`
        <div class="container">
          <div class="error">Пользователь не найден. Пожалуйста, войдите снова.</div>
        </div>
      `;
    }

    const inProgressCourses = this.courses.filter(
      (c) => c.status === 'in_progress' && c.last_session_id,
    );

    return html`
      <app-header></app-header>
      <div class="container">
        <div class="welcome">
          <h2>Добро пожаловать, ${user.name}!</h2>
          <p>Здесь собраны ваши курсы и последние результаты.</p>
        </div>

        <div class="top-bar">
          <div><strong>${this.courses.length}</strong> доступных курсов</div>
          <button class="secondary" @click=${this.handleViewProfile}>
            Перейти в профиль
          </button>
        </div>

        ${this.error ? html`<div class="error">${this.error}</div>` : null}
        ${inProgressCourses.length
          ? html`
              <div class="header">
                <h1>Продолжить обучение</h1>
                <p>Вернитесь к активным заданиям.</p>
              </div>

              <div class="courses-grid">
                ${inProgressCourses.map((course) => this.renderCourseCard(course, true))}
              </div>
            `
          : null}

        <div class="header">
          <h1>Все курсы</h1>
          <p>Начните новый курс или продолжите текущий.</p>
        </div>

        <div class="filters">
          <div class="filter-group">
            <span class="filter-label">Сложность</span>
            <select @change=${this.handleDifficultyFilterChange}>
              <option value="all">Все уровни</option>
              <option value="easy">Лёгкий</option>
              <option value="medium">Средний</option>
              <option value="hard">Сложный</option>
            </select>
          </div>

          <div class="filter-group">
            <span class="filter-label">Статус</span>
            <select @change=${this.handleStatusFilterChange}>
              <option value="all">Все статусы</option>
              <option value="new">Новый</option>
              <option value="in_progress">В процессе</option>
              <option value="completed">Завершён</option>
            </select>
          </div>
        </div>

        ${this.loading
          ? html`
              <div class="empty-state">
                <h3>Загружаем курсы...</h3>
              </div>
            `
          : this.filteredCourses.length === 0
            ? html`
                <div class="empty-state">
                  <h3>Курсы не найдены</h3>
                  <p>Попробуйте изменить фильтры.</p>
                </div>
              `
            : html`
                <div class="courses-grid">
                  ${this.filteredCourses.map((course) => this.renderCourseCard(course))}
                </div>
              `}
      </div>
    `;
  }

  private renderCourseCard(course: Course, showContinue = false) {
    const isBusy = this.actionCourseId === course.id;
    return html`
      <div class="course-card ${course.status}">
        <div class="course-header">
          <div>
            <h3 class="course-title">
              ${course.title}
              <span class="status-badge status-${course.status}">
                ${this.getStatusLabel(course.status)}
              </span>
            </h3>
          </div>
          <span class="difficulty-badge difficulty-${course.difficulty}">
            ${this.getDifficultyLabel(course.difficulty)}
          </span>
        </div>

        <p class="course-description">${course.description}</p>

        <div class="course-stats">
          <span>${course.completed_tasks} / ${course.total_tasks} заданий</span>
          <span>${course.progress}%</span>
        </div>

        <div class="progress-bar">
          <div class="progress-fill" style="width: ${course.progress}%"></div>
        </div>

        <div class="course-actions">
          ${course.status === 'new'
            ? html`
                <button
                  ?disabled=${isBusy}
                  @click=${() => this.handleStartCourse(course.id)}
                >
                  Начать курс
                </button>
              `
            : course.status === 'in_progress'
              ? html`
                  <button
                    ?disabled=${isBusy}
                    @click=${() =>
                      this.handleContinueCourse(course.id, course.last_session_id)}
                  >
                    ${showContinue ? 'Продолжить' : 'Продолжить курс'}
                  </button>
                `
              : html`
                  <button
                    class="secondary"
                    ?disabled=${isBusy}
                    @click=${() => this.handleStartCourse(course.id)}
                  >
                    Пройти ещё раз
                  </button>
                `}
        </div>
      </div>
    `;
  }
}
