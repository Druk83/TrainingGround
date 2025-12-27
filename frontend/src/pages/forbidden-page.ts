import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { authService } from '@/lib/auth-service';

@customElement('forbidden-page')
export class ForbiddenPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, var(--surface-1) 0%, var(--surface-2) 100%);
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
      padding: 1rem;
    }

    .container {
      background: var(--surface-2);
      border-radius: var(--radius-large, 12px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 3rem 2.5rem;
      width: 100%;
      max-width: 500px;
      text-align: center;
    }

    .error-code {
      font-size: 6rem;
      font-weight: 700;
      background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 1rem;
      line-height: 1;
    }

    h1 {
      margin: 0 0 1rem;
      font-size: 1.75rem;
      color: var(--text-main);
    }

    p {
      margin: 0 0 0.5rem;
      color: var(--text-muted);
      font-size: 1rem;
      line-height: 1.6;
    }

    .role-info {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: rgba(255, 68, 68, 0.1);
      border: 1px solid rgba(255, 68, 68, 0.3);
      border-radius: var(--radius-medium, 8px);
      margin: 1.5rem 0;
      font-family: monospace;
      font-size: 0.9rem;
    }

    .actions {
      margin-top: 2rem;
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    button {
      padding: 0.875rem 1.5rem;
      border: none;
      border-radius: var(--radius-medium, 8px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
      font-family: inherit;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-secondary {
      background: var(--surface-1);
      color: var(--text-main);
      border: 1px solid var(--border-color, #3a3a3a);
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }

    button:active {
      transform: translateY(0);
    }

    @media (max-width: 480px) {
      .container {
        padding: 2rem 1.5rem;
      }

      .error-code {
        font-size: 4rem;
      }

      h1 {
        font-size: 1.5rem;
      }

      .actions {
        flex-direction: column;
      }

      button {
        width: 100%;
      }
    }
  `;

  private getUserRole(): string {
    const user = authService.getUser();
    return user?.role || 'unknown';
  }

  private handleGoHome() {
    authService.redirectToHome();
  }

  private handleGoBack() {
    window.history.back();
  }

  render() {
    const role = this.getUserRole();

    return html`
      <div class="container">
        <div class="error-code">403</div>
        <h1>Доступ запрещён</h1>
        <p>У вас недостаточно прав для доступа к этой странице.</p>
        <div class="role-info">Ваша роль: ${role}</div>
        <p style="margin-top: 1rem; font-size: 0.9rem;">
          Если вы считаете, что это ошибка, обратитесь к администратору системы.
        </p>
        <div class="actions">
          <button class="btn-primary" @click=${this.handleGoHome}>
            Вернуться на главную
          </button>
          <button class="btn-secondary" @click=${this.handleGoBack}>Назад</button>
        </div>
      </div>
    `;
  }
}
