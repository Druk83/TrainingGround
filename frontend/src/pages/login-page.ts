import { authService } from '@/lib/auth-service';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('login-page')
export class LoginPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: linear-gradient(135deg, #0b1521 0%, #111d2d 100%);
      color: #f8fafc;
      font-family: 'Inter', system-ui, sans-serif;
      padding: 16px;
    }

    .login-container {
      background: #1e293b;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      padding: 24px;
      width: 100%;
      max-width: 420px;
    }

    .logo {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo h1 {
      margin: 0 0 8px;
      font-size: 32px;
      background: linear-gradient(135deg, #3b82f6 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .logo p {
      margin: 0;
      color: #a5b4cb;
      font-size: 14px;
    }

    .form-group {
      margin-bottom: 24px;
    }

    .offline-warning {
      background: #1e293b;
      border: 1px solid #0f172a;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      text-align: center;
      color: #fee2e2;
      font-weight: 600;
    }

    .field-error {
      color: #fecdd3;
      font-size: 0.85rem;
      margin-top: 6px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #f8fafc;
      font-size: 14px;
    }

    input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #0b1521;
      color: #f8fafc;
      font-size: 16px;
      font-family: inherit;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    button {
      width: 100%;
      padding: 12px 24px;
      background: linear-gradient(135deg, #3b82f6 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      height: 44px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .actions button {
      flex: 1;
    }

    .link-button {
      background: transparent;
      color: #38bdf8;
      text-decoration: underline;
      border: none;
      padding: 6px 12px;
      font: inherit;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .link-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .sso-button {
      width: 100%;
      margin-top: 8px;
      background: #111827;
      border: 1px solid #374151;
      color: #f8fafc;
      border-radius: 8px;
      padding: 10px 0;
    }

    .sso-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(37, 99, 235, 0.3);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error {
      background: #fca5a5;
      color: #0b1521;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }

    .links {
      margin-top: 24px;
      text-align: center;
      font-size: 14px;
    }

    .links a {
      color: #3b82f6;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 6px 12px;
      border-radius: var(--radius-md);
    }

    .links a:hover {
      color: #2563eb;
      text-decoration: underline;
    }
  `;

  @state() declare private email: string;
  @state() declare private password: string;
  @state() declare private loading: boolean;
  @state() declare private error: string;
  @state() declare private emailError?: string;
  @state() declare private passwordError?: string;
  @state() declare private online: boolean;
  private ssoEnabled = isFeatureEnabled('sso');

  constructor() {
    super();
    this.email = '';
    this.password = '';
    this.loading = false;
    this.error = '';
    this.online = navigator.onLine;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!document.title || document.title.trim().length === 0) {
      document.title = 'TrainingGround — Login';
    }
    window.addEventListener('online', this.handleOnlineStatus);
    window.addEventListener('offline', this.handleOfflineStatus);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('online', this.handleOnlineStatus);
    window.removeEventListener('offline', this.handleOfflineStatus);
  }

  private handleOnlineStatus = () => {
    this.online = true;
    this.error = '';
  };

  private handleOfflineStatus = () => {
    this.online = false;
  };

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.online) {
      this.error = 'Вход доступен только online';
      return;
    }

    this.emailError = undefined;
    this.passwordError = undefined;
    this.error = '';

    const trimmedEmail = this.email.trim();
    if (!trimmedEmail) {
      this.emailError = 'Введите email';
      return;
    }

    if (!this.isValidEmail(trimmedEmail)) {
      this.emailError = 'Введите корректный email';
      return;
    }

    if (this.password.length < 8) {
      this.passwordError = 'Пароль должен быть минимум 8 символов';
      return;
    }

    this.loading = true;

    try {
      await authService.login({
        email: trimmedEmail,
        password: this.password,
        remember_me: false,
      });
      authService.redirectToHome();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      if (message.toLowerCase().includes('blocked')) {
        this.error = message;
      } else {
        this.error = 'Неверный email или пароль';
      }
    } finally {
      this.loading = false;
    }
  }

  private handleForgotPassword = () => {
    window.location.href = '/forgot-password';
  };

  private handleSSOLogin = () => {
    window.location.href = '/auth/sso';
  };

  private isValidEmail(value: string) {
    // simple RFC-like check
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  render() {
    const emailErrorId = 'login-email-error';
    const passwordErrorId = 'login-password-error';

    return html`
      <div class="login-container">
        <div class="logo">
          <h1>TrainingGround</h1>
          <p>Платформа тренировок</p>
        </div>

        ${!this.online
          ? html`<div class="offline-warning" role="status">
              Вход доступен только online
            </div>`
          : null}
        ${this.error
          ? html`<div class="error" role="alert" aria-live="assertive">
              ${this.error}
            </div>`
          : ''}

        <form @submit=${this.handleSubmit}>
          <div class="form-group">
            <label for="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              .value=${this.email}
              @input=${(e: Event) => (this.email = (e.target as HTMLInputElement).value)}
              ?disabled=${this.loading}
              autocomplete="email"
              aria-label="Email"
              aria-invalid=${this.emailError ? 'true' : 'false'}
              aria-describedby=${this.emailError ? emailErrorId : nothing}
            />
            ${this.emailError
              ? html`<p
                  id=${emailErrorId}
                  class="field-error"
                  role="alert"
                  aria-live="assertive"
                >
                  ${this.emailError}
                </p>`
              : null}
          </div>

          <div class="form-group">
            <label for="login-password">Пароль</label>
            <input
              id="login-password"
              name="password"
              type="password"
              .value=${this.password}
              @input=${(e: Event) =>
                (this.password = (e.target as HTMLInputElement).value)}
              ?disabled=${this.loading}
              autocomplete="current-password"
              aria-label="Password"
              aria-invalid=${this.passwordError ? 'true' : 'false'}
              aria-describedby=${this.passwordError ? passwordErrorId : nothing}
            />
            ${this.passwordError
              ? html`<p
                  id=${passwordErrorId}
                  class="field-error"
                  role="alert"
                  aria-live="assertive"
                >
                  ${this.passwordError}
                </p>`
              : null}
          </div>

          <div class="actions">
            <button type="submit" ?disabled=${this.loading}>
              ${this.loading ? 'Вход...' : 'Войти'}
            </button>
            <button
              type="button"
              class="link-button"
              @click=${this.handleForgotPassword}
              ?disabled=${this.loading}
            >
              Забыли пароль?
            </button>
          </div>
        </form>

        <nav class="links">
          <p>Нет аккаунта? <a href="/register">Зарегистрироваться</a></p>
          ${this.ssoEnabled
            ? html`
                <button
                  type="button"
                  class="sso-button"
                  @click=${this.handleSSOLogin}
                  ?disabled=${this.loading}
                >
                  Войти через SSO
                </button>
              `
            : null}
        </nav>
      </div>
    `;
  }
}
