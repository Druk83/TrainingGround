import '@/components/app-header';
import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import { lessonStore, type ScoreState } from '@/lib/session-store';
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface ActiveSession {
  id: string;
  created_at: string;
  last_used_at: string;
  user_agent?: string;
  ip?: string;
  is_current: boolean;
}

@customElement('user-profile')
export class UserProfile extends LitElement {
  @state()
  declare private scoreboard: ScoreState;
  private unsubscribe?: () => void;
  private api: ApiClient;

  constructor() {
    super();
    const token = authService.getToken();
    this.api = new ApiClient({ jwt: token ?? undefined });
    this.scoreboard = {
      totalScore: 0,
      attempts: 0,
      correct: 0,
      accuracy: 0,
      currentStreak: 0,
      longestStreak: 0,
      hintsUsed: 0,
    };
    this.loading = false;
    this.error = '';
    this.success = '';
    this.showPasswordModal = false;
    this.sessions = [];
    this.oldPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-1);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
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
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-large, 12px);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .card h2 {
      margin: 0 0 1rem;
      font-size: 1.25rem;
      color: var(--text-main);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      background: var(--surface-3);
      border-radius: 0.75rem;
      padding: 1rem;
      border: 1px solid #111b2a;
      text-align: center;
    }

    .stat-card .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.35rem;
    }

    .stat-card .value {
      font-size: 1.5rem;
      font-weight: 600;
    }

    .info-grid {
      display: grid;
      gap: 1rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .info-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .info-value {
      font-size: 1rem;
      color: var(--text-main);
    }

    .role-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    button {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: var(--radius-medium, 8px);
      font-size: 0.95rem;
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
      opacity: 0.6;
      cursor: not-allowed;
    }

    button.secondary {
      background: var(--surface-3, #3a3a3a);
    }

    button.secondary:hover:not(:disabled) {
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }

    button.danger {
      background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
    }

    button.danger:hover:not(:disabled) {
      box-shadow: 0 6px 20px rgba(255, 68, 68, 0.3);
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal {
      background: var(--surface-2);
      border-radius: var(--radius-large, 12px);
      padding: 2rem;
      width: 100%;
      max-width: 450px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .modal h3 {
      margin: 0 0 1.5rem;
      font-size: 1.5rem;
      color: var(--text-main);
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-main);
      font-size: 0.9rem;
    }

    input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border-color, #3a3a3a);
      border-radius: var(--radius-medium, 8px);
      background: var(--surface-1);
      color: var(--text-main);
      font-size: 1rem;
      font-family: inherit;
      box-sizing: border-box;
      transition:
        border-color 0.2s,
        box-shadow 0.2s;
    }

    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    .modal-actions button {
      flex: 1;
    }

    .error {
      background: #ff4444;
      color: white;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-medium, 8px);
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .success {
      background: #44ff44;
      color: #000;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-medium, 8px);
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .session-item {
      background: var(--surface-1);
      border-radius: var(--radius-medium, 8px);
      padding: 1rem;
      border: 1px solid var(--border-color, #3a3a3a);
    }

    .session-item.current {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .session-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 0.5rem;
    }

    .session-device {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.95rem;
    }

    .session-badge {
      background: #667eea;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .session-info {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
    }

    @media (max-width: 768px) {
      :host {
        padding: 1rem 0.5rem;
      }

      .header h1 {
        font-size: 1.5rem;
      }

      .card {
        padding: 1rem;
      }

      .modal {
        padding: 1.5rem;
      }

      .modal-actions {
        flex-direction: column;
      }
    }
  `;

  @state() declare private loading: boolean;
  @state() declare private error: string;
  @state() declare private success: string;
  @state() declare private showPasswordModal: boolean;
  @state() declare private sessions: ActiveSession[];
  @state() declare private oldPassword: string;
  @state() declare private newPassword: string;
  @state() declare private confirmPassword: string;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = lessonStore.subscribe((snapshot) => {
      this.scoreboard = { ...snapshot.scoreboard };
    });
    this.loadSessions();
    this.loadStudentStats();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private async loadSessions() {
    try {
      const token = authService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/v1/auth/sessions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load sessions');
      }

      this.sessions = await response.json();
    } catch (err) {
      console.error('Failed to load sessions:', err);
      this.error = 'Не удалось загрузить список сессий';
    }
  }

  private async loadStudentStats() {
    try {
      const token = authService.getToken();
      if (!token) {
        console.warn('User not authenticated, skipping stats load');
        return;
      }

      // Update API client token if needed
      this.api.setToken(token);

      const stats = await this.api.getStudentStats();

      // Update scoreboard from stats
      this.scoreboard = {
        totalScore: stats.total_score,
        attempts: stats.attempts_total,
        correct: stats.correct_total,
        accuracy: Math.round(stats.accuracy * 100) / 100, // Round to 2 decimal places
        currentStreak: stats.current_streak,
        longestStreak: 0, // Backend doesn't return this, but we can calculate it if needed
        hintsUsed: stats.hints_used,
      };
    } catch (err) {
      console.error('Failed to load student stats:', err);
      // Don't set error message here as it's not critical
    }
  }

  private handleOpenPasswordModal() {
    this.showPasswordModal = true;
    this.error = '';
    this.success = '';
    this.oldPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  private handleClosePasswordModal() {
    this.showPasswordModal = false;
    this.oldPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  private async handleChangePassword(e: Event) {
    e.preventDefault();

    // Validation
    if (!this.oldPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Пожалуйста, заполните все поля';
      return;
    }

    if (this.newPassword.length < 8) {
      this.error = 'Новый пароль должен быть минимум 8 символов';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Пароли не совпадают';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      const token = authService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_password: this.oldPassword,
          new_password: this.newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Failed to change password' }));
        throw new Error(errorData.message || 'Не удалось сменить пароль');
      }

      this.success = 'Пароль успешно изменен';
      setTimeout(() => {
        this.handleClosePasswordModal();
      }, 1500);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Неизвестная ошибка';
    } finally {
      this.loading = false;
    }
  }

  private async handleRevokeOtherSessions() {
    if (!confirm('Вы действительно хотите завершить все другие сессии?')) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      const token = authService.getToken();

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/v1/auth/sessions/revoke', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include', // Include HTTP-only cookie with refresh_token
      });

      if (!response.ok) {
        throw new Error('Failed to revoke sessions');
      }

      const result = await response.json();
      this.success = `Завершено сессий: ${result.revoked_count}`;

      // Reload sessions list
      await this.loadSessions();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Не удалось завершить сессии';
    } finally {
      this.loading = false;
    }
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  }

  private parseUserAgent(ua?: string): string {
    if (!ua) return 'Неизвестное устройство';

    // Simple user agent parsing
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';

    return 'Браузер';
  }

  render() {
    const user = authService.getUser();

    if (!user) {
      return html`
        <app-header></app-header>
        <div class="container">
          <div class="error">Пользователь не найден. Пожалуйста, войдите в систему.</div>
        </div>
      `;
    }

    return html`
      <app-header></app-header>
      <div class="container">
        <div class="header">
          <h1>Профиль пользователя</h1>
          <p>Управление аккаунтом и безопасностью</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="label">Баллы</span>
            <span class="value">${this.scoreboard.totalScore}</span>
          </div>
          <div class="stat-card">
            <span class="label">Точность</span>
            <span class="value">${this.scoreboard.accuracy.toFixed(2)}%</span>
          </div>
          <div class="stat-card">
            <span class="label">Серия</span>
            <span class="value">${this.scoreboard.currentStreak}</span>
          </div>
          <div class="stat-card">
            <span class="label">Подсказки</span>
            <span class="value">${this.scoreboard.hintsUsed}</span>
          </div>
        </div>

        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ''}
        ${this.success
          ? html`<div class="success" role="alert">${this.success}</div>`
          : ''}

        <!-- User Information -->
        <div class="card">
          <h2>Информация о профиле</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Email</span>
              <span class="info-value">${user.email}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Имя</span>
              <span class="info-value">${user.name}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Роль</span>
              <span class="role-badge">${user.role}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Дата регистрации</span>
              <span class="info-value">${this.formatDate(user.created_at)}</span>
            </div>
            ${user.last_login_at
              ? html`
                  <div class="info-item">
                    <span class="info-label">Последний вход</span>
                    <span class="info-value">${this.formatDate(user.last_login_at)}</span>
                  </div>
                `
              : ''}
          </div>
        </div>

        <!-- Security -->
        <div class="card">
          <h2>Безопасность</h2>
          <button @click=${this.handleOpenPasswordModal} ?disabled=${this.loading}>
            Сменить пароль
          </button>
        </div>

        <!-- Active Sessions -->
        <div class="card">
          <h2>Активные сессии</h2>

          ${this.sessions.length === 0
            ? html` <div class="loading">Загрузка сессий...</div> `
            : html`
                <div class="session-list">
                  ${this.sessions.map(
                    (session) => html`
                      <div class="session-item ${session.is_current ? 'current' : ''}">
                        <div class="session-header">
                          <div class="session-device">
                            ${this.parseUserAgent(session.user_agent)}
                          </div>
                          ${session.is_current
                            ? html`<span class="session-badge">Текущая</span>`
                            : ''}
                        </div>
                        <div class="session-info">
                          ${session.ip ? html`<div>IP: ${session.ip}</div>` : ''}
                          <div>Создана: ${this.formatDate(session.created_at)}</div>
                          <div>
                            Последняя активность: ${this.formatDate(session.last_used_at)}
                          </div>
                        </div>
                      </div>
                    `,
                  )}
                </div>

                ${this.sessions.length > 1
                  ? html`
                      <button
                        class="danger"
                        @click=${this.handleRevokeOtherSessions}
                        ?disabled=${this.loading}
                        style="margin-top: 1rem;"
                      >
                        Завершить все другие сессии
                      </button>
                    `
                  : ''}
              `}
        </div>

        <button class="secondary" @click=${() => authService.redirectToHome()}>
          Вернуться на главную
        </button>
      </div>

      ${this.showPasswordModal
        ? html`
            <div
              class="modal-overlay"
              @click=${(e: Event) => {
                if (e.target === e.currentTarget) this.handleClosePasswordModal();
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Escape') this.handleClosePasswordModal();
              }}
            >
              <div class="modal">
                <h3>Смена пароля</h3>

                ${this.error
                  ? html`<div class="error" role="alert">${this.error}</div>`
                  : ''}
                ${this.success
                  ? html`<div class="success" role="alert">${this.success}</div>`
                  : ''}

                <form @submit=${this.handleChangePassword}>
                  <div class="form-group">
                    <label for="old-password">Текущий пароль</label>
                    <input
                      id="old-password"
                      type="password"
                      .value=${this.oldPassword}
                      @input=${(e: Event) =>
                        (this.oldPassword = (e.target as HTMLInputElement).value)}
                      ?disabled=${this.loading}
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label for="new-password">Новый пароль (минимум 8 символов)</label>
                    <input
                      id="new-password"
                      type="password"
                      .value=${this.newPassword}
                      @input=${(e: Event) =>
                        (this.newPassword = (e.target as HTMLInputElement).value)}
                      ?disabled=${this.loading}
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label for="confirm-password">Подтвердите новый пароль</label>
                    <input
                      id="confirm-password"
                      type="password"
                      .value=${this.confirmPassword}
                      @input=${(e: Event) =>
                        (this.confirmPassword = (e.target as HTMLInputElement).value)}
                      ?disabled=${this.loading}
                      required
                    />
                  </div>

                  <div class="modal-actions">
                    <button
                      type="button"
                      class="secondary"
                      @click=${this.handleClosePasswordModal}
                      ?disabled=${this.loading}
                    >
                      Отмена
                    </button>
                    <button type="submit" ?disabled=${this.loading}>
                      ${this.loading ? 'Изменение...' : 'Изменить пароль'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          `
        : ''}
    `;
  }
}
