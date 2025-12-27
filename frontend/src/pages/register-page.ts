import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { authService } from '@/lib/auth-service';

@customElement('register-page')
export class RegisterPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
      padding: var(--spacing-md);
    }

    .register-container {
      background: var(--surface-2);
      border-radius: var(--radius-lg);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: var(--spacing-lg);
      width: 100%;
      max-width: 420px;
    }

    .logo {
      text-align: center;
      margin-bottom: var(--spacing-xl);
    }

    .logo h1 {
      margin: 0 0 var(--spacing-xs);
      font-size: var(--font-3xl);
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .logo p {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--font-sm);
    }

    .form-group {
      margin-bottom: var(--spacing-lg);
    }

    label {
      display: block;
      margin-bottom: var(--spacing-xs);
      font-weight: 500;
      color: var(--text-main);
      font-size: var(--font-sm);
    }

    input {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--border-color, #3a3a3a);
      border-radius: var(--radius-md);
      background: var(--surface-1);
      color: var(--text-main);
      font-size: var(--font-base);
      font-family: inherit;
      box-sizing: border-box;
      transition:
        border-color 0.2s,
        box-shadow 0.2s;
    }

    input:focus {
      outline: none;
      border-color: var(--focus-ring);
      box-shadow: 0 0 0 3px var(--primary-soft);
    }

    input:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: 1px;
    }

    input::placeholder {
      color: var(--text-muted);
    }

    .password-hint {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .password-strength {
      margin-top: 0.5rem;
      height: 4px;
      background: var(--surface-1);
      border-radius: 2px;
      overflow: hidden;
    }

    .password-strength-bar {
      height: 100%;
      transition:
        width 0.3s,
        background-color 0.3s;
    }

    .strength-weak {
      width: 33%;
      background-color: var(--error);
    }

    .strength-medium {
      width: 66%;
      background-color: var(--warning);
    }

    .strength-strong {
      width: 100%;
      background-color: var(--success);
    }

    button {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-lg);
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-base);
      font-weight: 600;
      cursor: pointer;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
      font-family: inherit;
    }

    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
    }

    button:active:not(:disabled) {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error {
      background: var(--error);
      color: var(--surface-0);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-lg);
      font-size: var(--font-sm);
      animation: slideIn 0.3s ease-out;
      font-weight: 500;
    }

    .success {
      background: var(--success);
      color: var(--surface-0);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-lg);
      font-size: var(--font-sm);
      animation: slideIn 0.3s ease-out;
      font-weight: 500;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .links {
      margin-top: var(--spacing-lg);
      text-align: center;
      font-size: var(--font-sm);
    }

    .links a {
      color: var(--primary);
      text-decoration: none;
      transition: color 0.2s;
    }

    .links a:hover {
      color: var(--primary-hover);
      text-decoration: underline;
    }

    /* XXS: ≤480px */
    @media (max-width: 480px) {
      :host {
        padding: var(--spacing-sm);
      }

      .register-container {
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
      }

      .logo {
        margin-bottom: var(--spacing-lg);
      }

      .logo h1 {
        font-size: var(--font-2xl);
      }

      .logo p {
        font-size: var(--font-xs);
      }

      .form-group {
        margin-bottom: var(--spacing-md);
      }
    }

    /* XS: 481-640px */
    @media (min-width: 481px) and (max-width: 640px) {
      .register-container {
        padding: var(--spacing-lg);
      }
    }

    /* SM and above: 641px+ */
    @media (min-width: 641px) {
      .register-container {
        padding: var(--spacing-2xl);
      }
    }
  `;

  @state() declare private name: string;
  @state() declare private email: string;
  @state() declare private password: string;
  @state() declare private confirmPassword: string;
  @state() declare private loading: boolean;
  @state() declare private error: string;
  @state() declare private success: string;

  constructor() {
    super();
    this.name = '';
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
    this.loading = false;
    this.error = '';
    this.success = '';
  }

  private calculatePasswordStrength(): 'weak' | 'medium' | 'strong' | null {
    if (!this.password) return null;

    let strength = 0;
    if (this.password.length >= 8) strength++;
    if (/[a-z]/.test(this.password) && /[A-Z]/.test(this.password)) strength++;
    if (/\d/.test(this.password)) strength++;
    if (/[^a-zA-Z\d]/.test(this.password)) strength++;

    if (strength <= 1) return 'weak';
    if (strength <= 3) return 'medium';
    return 'strong';
  }

  private handleNameInput(e: Event) {
    this.name = (e.target as HTMLInputElement).value;
    this.error = '';
  }

  private handleEmailInput(e: Event) {
    this.email = (e.target as HTMLInputElement).value;
    this.error = '';
  }

  private handlePasswordInput(e: Event) {
    this.password = (e.target as HTMLInputElement).value;
    this.error = '';
  }

  private handleConfirmPasswordInput(e: Event) {
    this.confirmPassword = (e.target as HTMLInputElement).value;
    this.error = '';
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Escape key clears the form
    if (e.key === 'Escape') {
      e.preventDefault();
      this.name = '';
      this.email = '';
      this.password = '';
      this.confirmPassword = '';
      this.error = '';
      this.success = '';

      // Focus first input
      const nameInput = this.shadowRoot?.querySelector('#name') as HTMLInputElement;
      nameInput?.focus();
    }
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    // Validation
    if (!this.name || !this.email || !this.password || !this.confirmPassword) {
      this.error = 'Пожалуйста, заполните все поля';
      return;
    }

    if (!this.email.includes('@')) {
      this.error = 'Неверный формат email';
      return;
    }

    if (this.password.length < 8) {
      this.error = 'Пароль должен содержать минимум 8 символов';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Пароли не совпадают';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      await authService.register({
        name: this.name,
        email: this.email,
        password: this.password,
      });

      this.success = 'Регистрация успешна! Перенаправление...';

      // Redirect after short delay
      setTimeout(() => {
        authService.redirectToHome();
      }, 1500);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Неизвестная ошибка';
    } finally {
      this.loading = false;
    }
  }

  render() {
    const passwordStrength = this.calculatePasswordStrength();

    return html`
      <div class="register-container">
        <div class="logo">
          <h1>TrainingGround</h1>
          <p>Создайте аккаунт для начала обучения</p>
        </div>

        ${this.error
          ? html`<div id="register-error" class="error" role="alert" aria-live="polite">
              ${this.error}
            </div>`
          : ''}
        ${this.success
          ? html`<div
              id="register-success"
              class="success"
              role="status"
              aria-live="polite"
            >
              ${this.success}
            </div>`
          : ''}

        <form
          @submit=${this.handleSubmit}
          @keydown=${this.handleKeyDown}
          role="form"
          aria-label="Форма регистрации"
        >
          <div class="form-group">
            <label for="name">Имя</label>
            <input
              id="name"
              type="text"
              placeholder="Иван Иванов"
              .value=${this.name}
              @input=${this.handleNameInput}
              ?disabled=${this.loading}
              autocomplete="name"
              required
              aria-required="true"
              aria-describedby="${this.error ? 'register-error' : ''}"
            />
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              .value=${this.email}
              @input=${this.handleEmailInput}
              ?disabled=${this.loading}
              autocomplete="email"
              required
              aria-required="true"
              aria-invalid="${this.error && !this.email.includes('@') ? 'true' : 'false'}"
              aria-describedby="${this.error ? 'register-error' : ''}"
            />
          </div>

          <div class="form-group">
            <label for="password">Пароль</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              .value=${this.password}
              @input=${this.handlePasswordInput}
              ?disabled=${this.loading}
              autocomplete="new-password"
              required
              aria-required="true"
              aria-describedby="password-hint ${this.error ? 'register-error' : ''}"
              aria-invalid="${this.error && this.password.length < 8 ? 'true' : 'false'}"
            />
            <div id="password-hint" class="password-hint">Минимум 8 символов</div>
            ${passwordStrength
              ? html`
                  <div
                    class="password-strength"
                    role="progressbar"
                    aria-label="Надежность пароля"
                    aria-valuenow="${passwordStrength === 'weak'
                      ? 33
                      : passwordStrength === 'medium'
                        ? 66
                        : 100}"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div class="password-strength-bar strength-${passwordStrength}"></div>
                  </div>
                `
              : ''}
          </div>

          <div class="form-group">
            <label for="confirm-password">Подтвердите пароль</label>
            <input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              .value=${this.confirmPassword}
              @input=${this.handleConfirmPasswordInput}
              ?disabled=${this.loading}
              autocomplete="new-password"
              required
              aria-required="true"
              aria-describedby="${this.error ? 'register-error' : ''}"
              aria-invalid="${this.error && this.password !== this.confirmPassword
                ? 'true'
                : 'false'}"
            />
          </div>

          <button
            type="submit"
            ?disabled=${this.loading}
            aria-busy="${this.loading ? 'true' : 'false'}"
            aria-label="${this.loading
              ? 'Выполняется регистрация'
              : 'Зарегистрироваться'}"
          >
            ${this.loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <nav class="links" aria-label="Дополнительные действия">
          <p>
            Уже есть аккаунт?
            <a href="/login" aria-label="Перейти на страницу входа">Войти</a>
          </p>
        </nav>
      </div>
    `;
  }
}
