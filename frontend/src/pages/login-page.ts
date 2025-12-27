import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { authService } from '@/lib/auth-service';

@customElement('login-page')
export class LoginPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
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

  constructor() {
    super();
    this.email = '';
    this.password = '';
    this.loading = false;
    this.error = '';
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    if (!this.email || !this.password) {
      this.error = 'Пожалуйста, заполните все поля';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await authService.login({
        email: this.email,
        password: this.password,
        remember_me: false,
      });

      authService.redirectToHome();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Неизвестная ошибка';
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="login-container">
        <div class="logo">
          <h1>TrainingGround</h1>
          <p>Платформа обучения программированию</p>
        </div>

        ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : ''}

        <form @submit=${this.handleSubmit}>
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              .value=${this.email}
              @input=${(e: Event) => (this.email = (e.target as HTMLInputElement).value)}
              ?disabled=${this.loading}
              autocomplete="email"
              required
            />
          </div>

          <div class="form-group">
            <label for="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              .value=${this.password}
              @input=${(e: Event) =>
                (this.password = (e.target as HTMLInputElement).value)}
              ?disabled=${this.loading}
              autocomplete="current-password"
              required
            />
          </div>

          <button type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <nav class="links">
          <p>Нет аккаунта? <a href="/register">Зарегистрироваться</a></p>
        </nav>
      </div>
    `;
  }
}
