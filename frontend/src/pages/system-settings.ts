import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import type {
  AnticheatSettings,
  EmailSettings,
  SettingsTestResponse,
  SsoSettings,
  SystemSettingsResponse,
  YandexGptSettings,
} from '@/lib/api-types';
import { authService } from '@/lib/auth-service';
import '@/components/app-header';

const DEFAULT_YANDEX: YandexGptSettings = {
  api_key: '',
  folder_id: '',
  model: 'yandexgpt',
  temperature: 0.3,
  max_tokens: 500,
};

const DEFAULT_SSO: SsoSettings = {
  enabled: false,
  provider: 'yandex',
  client_id: '',
  client_secret: '',
  redirect_uri: '',
};

const DEFAULT_EMAIL: EmailSettings = {
  server: '',
  port: 587,
  login: '',
  password: '',
  from_email: '',
  from_name: '',
  use_tls: true,
};

const DEFAULT_ANTICHEAT: AnticheatSettings = {
  speed_threshold_seconds: 5,
  max_speed_hits: 10,
  max_repeated_hits: 8,
  block_duration_hours: 24,
  captcha_enabled: false,
  captcha_threshold: 3,
};

type NoticeType = 'success' | 'error';

@customElement('system-settings-page')
export class SystemSettingsPage extends LitElement {
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
      padding: 2rem 1.5rem 4rem;
    }

    h1 {
      margin: 0 0 1.5rem;
    }

    .card-grid {
      display: grid;
      gap: 1.5rem;
    }

    .card {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-muted);
    }

    input,
    select,
    textarea {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius-medium);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--surface-3);
      color: var(--text-main);
      font-size: 1rem;
    }

    .secret-input {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .secret-input input {
      flex: 1;
    }

    input[type='checkbox'] {
      width: auto;
      accent-color: var(--primary);
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    button {
      border: none;
      border-radius: var(--radius-medium);
      padding: 0.65rem 1.2rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }

    button.primary {
      background: var(--primary);
      color: #fff;
    }

    button.ghost {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: var(--text-main);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .notification {
      margin-bottom: 1.5rem;
      padding: 0.9rem 1rem;
      border-radius: var(--radius-medium);
      font-weight: 500;
    }

    .notification.success {
      background: rgba(34, 197, 94, 0.15);
      color: rgb(34, 197, 94);
    }

    .notification.error {
      background: rgba(239, 68, 68, 0.15);
      color: rgb(239, 68, 68);
    }

    .muted {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    @media (min-width: 900px) {
      .card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  private apiClient: ApiClient;

  @state() declare private loading: boolean;
  @state() declare private settings?: SystemSettingsResponse;
  @state() declare private error?: string;
  @state() declare private notice?: { type: NoticeType; message: string };
  @state() declare private savingYandex: boolean;
  @state() declare private savingSso: boolean;
  @state() declare private savingEmail: boolean;
  @state() declare private savingAnticheat: boolean;
  @state() declare private testingYandex: boolean;
  @state() declare private testingSso: boolean;
  @state() declare private testingEmail: boolean;
  @state() declare private showYandexApiKey: boolean;
  @state() declare private showSsoSecret: boolean;
  @state() declare private showEmailPassword: boolean;

  constructor() {
    super();
    this.apiClient = new ApiClient({ jwt: authService.getToken() || undefined });
    this.loading = true;
    this.settings = undefined;
    this.error = undefined;
    this.notice = undefined;
    this.savingYandex = false;
    this.savingSso = false;
    this.savingEmail = false;
    this.savingAnticheat = false;
    this.testingYandex = false;
    this.testingSso = false;
    this.testingEmail = false;
    this.showYandexApiKey = false;
    this.showSsoSecret = false;
    this.showEmailPassword = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.loadSettings();
  }

  private async loadSettings() {
    this.loading = true;
    this.error = undefined;
    try {
      const data = await this.apiClient.getSystemSettings();
      this.settings = data;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Не удалось загрузить настройки';
    } finally {
      this.loading = false;
    }
  }

  private get yandexSettings(): YandexGptSettings {
    return this.settings?.yandexgpt ?? { ...DEFAULT_YANDEX };
  }

  private get ssoSettings(): SsoSettings {
    return this.settings?.sso ?? { ...DEFAULT_SSO };
  }

  private get emailSettings(): EmailSettings {
    return this.settings?.email ?? { ...DEFAULT_EMAIL };
  }

  private get anticheatSettings(): AnticheatSettings {
    return this.settings?.anticheat ?? { ...DEFAULT_ANTICHEAT };
  }

  render() {
    return html`
      <app-header></app-header>
      <div class="page">
        <h1>Системные настройки</h1>
        ${this.notice
          ? html`<div class="notification ${this.notice.type}">
              ${this.notice.message}
            </div>`
          : null}
        ${this.error ? html`<div class="notification error">${this.error}</div>` : null}
        ${this.loading
          ? html`<div class="card">Загрузка настроек...</div>`
          : html`
              <div class="card-grid">
                ${this.renderYandexSection()} ${this.renderSsoSection()}
                ${this.renderEmailSection()} ${this.renderAnticheatSection()}
              </div>
            `}
      </div>
    `;
  }

  private renderYandexSection() {
    const settings = this.yandexSettings;
    return html`
      <section class="card">
        <div class="card-header">
          <div>
            <h2>YandexGPT</h2>
            <p class="muted">Параметры генерации объяснений</p>
          </div>
          <button
            class="ghost"
            @click=${this.handleTestYandex}
            ?disabled=${this.testingYandex}
          >
            ${this.testingYandex ? 'Проверка...' : 'Тест подключения'}
          </button>
        </div>
        <form @submit=${this.handleYandexSubmit}>
          <label>
            API Key
            <div class="secret-input">
              <input
                type=${this.showYandexApiKey ? 'text' : 'password'}
                name="api_key"
                .value=${settings.api_key}
                required
                autocomplete="off"
              />
              <button
                type="button"
                class="ghost"
                @click=${this.toggleYandexApiKey}
                aria-pressed=${this.showYandexApiKey ? 'true' : 'false'}
              >
                ${this.showYandexApiKey ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </label>
          <label>
            Folder ID
            <input type="text" name="folder_id" .value=${settings.folder_id} required />
          </label>
          <label>
            Модель
            <select name="model" .value=${settings.model}>
              <option value="yandexgpt">yandexgpt</option>
              <option value="yandexgpt-lite">yandexgpt-lite</option>
            </select>
          </label>
          <label>
            Temperature
            <input
              type="number"
              name="temperature"
              min="0"
              max="1"
              step="0.1"
              .value=${String(settings.temperature)}
            />
          </label>
          <label>
            Max tokens
            <input
              type="number"
              name="max_tokens"
              min="100"
              max="4000"
              .value=${String(settings.max_tokens)}
            />
          </label>
          <div class="actions">
            <button class="primary" type="submit" ?disabled=${this.savingYandex}>
              ${this.savingYandex ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  private renderSsoSection() {
    const settings = this.ssoSettings;
    return html`
      <section class="card">
        <div class="card-header">
          <div>
            <h2>SSO (OAuth2/SAML)</h2>
            <p class="muted">Внешние провайдеры авторизации</p>
          </div>
          <button class="ghost" @click=${this.handleTestSso} ?disabled=${this.testingSso}>
            ${this.testingSso ? 'Проверка...' : 'Тест SSO'}
          </button>
        </div>
        <form @submit=${this.handleSsoSubmit}>
          <label>
            <span>Включить SSO</span>
            <input type="checkbox" name="enabled" ?checked=${settings.enabled} />
          </label>
          <label>
            Провайдер
            <select name="provider" .value=${settings.provider}>
              <option value="yandex">Яндекс ID</option>
              <option value="vk">VK ID</option>
              <option value="gosuslugi">Госуслуги</option>
            </select>
          </label>
          <label>
            Client ID
            <input type="text" name="client_id" .value=${settings.client_id} />
          </label>
          <label>
            Client Secret
            <div class="secret-input">
              <input
                type=${this.showSsoSecret ? 'text' : 'password'}
                name="client_secret"
                .value=${settings.client_secret}
                autocomplete="off"
              />
              <button
                type="button"
                class="ghost"
                @click=${this.toggleSsoSecret}
                aria-pressed=${this.showSsoSecret ? 'true' : 'false'}
              >
                ${this.showSsoSecret ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </label>
          <label>
            Redirect URI
            <input type="text" name="redirect_uri" .value=${settings.redirect_uri} />
          </label>
          <div class="actions">
            <button class="primary" type="submit" ?disabled=${this.savingSso}>
              ${this.savingSso ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  private renderEmailSection() {
    const settings = this.emailSettings;
    return html`
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Email (SMTP)</h2>
            <p class="muted">Уведомления и приглашения</p>
          </div>
          <button
            class="ghost"
            @click=${this.handleTestEmail}
            ?disabled=${this.testingEmail}
          >
            ${this.testingEmail ? 'Проверка...' : 'Тест письма'}
          </button>
        </div>
        <form @submit=${this.handleEmailSubmit}>
          <label>
            SMTP сервер
            <input type="text" name="server" .value=${settings.server} required />
          </label>
          <label>
            Порт
            <input type="number" name="port" min="1" .value=${String(settings.port)} />
          </label>
          <label>
            Логин
            <input type="text" name="login" .value=${settings.login} />
          </label>
          <label>
            Пароль
            <div class="secret-input">
              <input
                type=${this.showEmailPassword ? 'text' : 'password'}
                name="password"
                .value=${settings.password}
                autocomplete="off"
              />
              <button
                type="button"
                class="ghost"
                @click=${this.toggleEmailPassword}
                aria-pressed=${this.showEmailPassword ? 'true' : 'false'}
              >
                ${this.showEmailPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </label>
          <label>
            Отправитель (email)
            <input type="email" name="from_email" .value=${settings.from_email} />
          </label>
          <label>
            Имя отправителя
            <input type="text" name="from_name" .value=${settings.from_name} />
          </label>
          <label>
            <span>Использовать TLS</span>
            <input type="checkbox" name="use_tls" ?checked=${settings.use_tls} />
          </label>
          <div class="actions">
            <button class="primary" type="submit" ?disabled=${this.savingEmail}>
              ${this.savingEmail ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  private renderAnticheatSection() {
    const settings = this.anticheatSettings;
    return html`
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Античит</h2>
            <p class="muted">Пороговые значения и CAPTCHA</p>
          </div>
        </div>
        <form @submit=${this.handleAnticheatSubmit}>
          <label>
            Порог времени ответа (сек)
            <input
              type="number"
              name="speed_threshold_seconds"
              min="1"
              .value=${String(settings.speed_threshold_seconds)}
            />
          </label>
          <label>
            Максимум speed hits
            <input
              type="number"
              name="max_speed_hits"
              min="1"
              .value=${String(settings.max_speed_hits)}
            />
          </label>
          <label>
            Максимум repeated hits
            <input
              type="number"
              name="max_repeated_hits"
              min="1"
              .value=${String(settings.max_repeated_hits)}
            />
          </label>
          <label>
            Длительность блокировки (часы)
            <input
              type="number"
              name="block_duration_hours"
              min="1"
              .value=${String(settings.block_duration_hours)}
            />
          </label>
          <label>
            <span>Включить CAPTCHA</span>
            <input
              type="checkbox"
              name="captcha_enabled"
              ?checked=${settings.captcha_enabled}
            />
          </label>
          <label>
            Порог для CAPTCHA
            <input
              type="number"
              name="captcha_threshold"
              min="1"
              .value=${String(settings.captcha_threshold)}
            />
          </label>
          <div class="actions">
            <button class="primary" type="submit" ?disabled=${this.savingAnticheat}>
              ${this.savingAnticheat ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  private async handleYandexSubmit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const payload: YandexGptSettings = {
      api_key: String(data.get('api_key') ?? ''),
      folder_id: String(data.get('folder_id') ?? ''),
      model: String(data.get('model') ?? 'yandexgpt'),
      temperature: Number(data.get('temperature') ?? 0.3),
      max_tokens: Number(data.get('max_tokens') ?? 500),
    };

    await this.saveSettings(
      () => {
        this.savingYandex = true;
        return this.apiClient.updateYandexGptSettings(payload);
      },
      (result) => {
        this.settings = { ...this.settings, yandexgpt: result };
      },
      'Настройки YandexGPT сохранены',
      () => (this.savingYandex = false),
    );
  }

  private async handleSsoSubmit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const payload: SsoSettings = {
      enabled: data.get('enabled') === 'on',
      provider: String(data.get('provider') ?? 'yandex'),
      client_id: String(data.get('client_id') ?? ''),
      client_secret: String(data.get('client_secret') ?? ''),
      redirect_uri: String(data.get('redirect_uri') ?? ''),
    };

    await this.saveSettings(
      () => {
        this.savingSso = true;
        return this.apiClient.updateSsoSettings(payload);
      },
      (result) => (this.settings = { ...this.settings, sso: result }),
      'SSO настройки обновлены',
      () => (this.savingSso = false),
    );
  }

  private async handleEmailSubmit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const payload: EmailSettings = {
      server: String(data.get('server') ?? ''),
      port: Number(data.get('port') ?? 587),
      login: String(data.get('login') ?? ''),
      password: String(data.get('password') ?? ''),
      from_email: String(data.get('from_email') ?? ''),
      from_name: String(data.get('from_name') ?? ''),
      use_tls: data.get('use_tls') === 'on',
    };

    await this.saveSettings(
      () => {
        this.savingEmail = true;
        return this.apiClient.updateEmailSettings(payload);
      },
      (result) => (this.settings = { ...this.settings, email: result }),
      'SMTP настройки сохранены',
      () => (this.savingEmail = false),
    );
  }

  private async handleAnticheatSubmit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const payload: AnticheatSettings = {
      speed_threshold_seconds: Number(data.get('speed_threshold_seconds') ?? 5),
      max_speed_hits: Number(data.get('max_speed_hits') ?? 10),
      max_repeated_hits: Number(data.get('max_repeated_hits') ?? 8),
      block_duration_hours: Number(data.get('block_duration_hours') ?? 24),
      captcha_enabled: data.get('captcha_enabled') === 'on',
      captcha_threshold: Number(data.get('captcha_threshold') ?? 3),
    };

    await this.saveSettings(
      () => {
        this.savingAnticheat = true;
        return this.apiClient.updateAnticheatSettings(payload);
      },
      (result) => (this.settings = { ...this.settings, anticheat: result }),
      'Античит настройки обновлены',
      () => (this.savingAnticheat = false),
    );
  }

  private async handleTestYandex() {
    await this.runTest(
      () => {
        this.testingYandex = true;
        return this.apiClient.testYandexGptSettings();
      },
      'Проверка YandexGPT выполнена',
      () => (this.testingYandex = false),
    );
  }

  private async handleTestSso() {
    await this.runTest(
      () => {
        this.testingSso = true;
        return this.apiClient.testSsoSettings();
      },
      'Проверка SSO выполнена',
      () => (this.testingSso = false),
    );
  }

  private async handleTestEmail() {
    await this.runTest(
      () => {
        this.testingEmail = true;
        return this.apiClient.testEmailSettings();
      },
      'Тестовое письмо отправлено (логика заглушки)',
      () => (this.testingEmail = false),
    );
  }

  private toggleYandexApiKey() {
    this.showYandexApiKey = !this.showYandexApiKey;
  }

  private toggleSsoSecret() {
    this.showSsoSecret = !this.showSsoSecret;
  }

  private toggleEmailPassword() {
    this.showEmailPassword = !this.showEmailPassword;
  }

  private async saveSettings<T>(
    action: () => Promise<T>,
    onSuccess: (result: T) => void,
    successMessage: string,
    onFinally: () => void,
  ) {
    this.error = undefined;
    try {
      const result = await action();
      onSuccess(result);
      this.showNotice(successMessage, 'success');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Ошибка при сохранении';
      this.showNotice(msg, 'error');
    } finally {
      onFinally();
    }
  }

  private async runTest(
    action: () => Promise<SettingsTestResponse>,
    fallbackMessage: string,
    onFinally: () => void,
  ) {
    try {
      const result = await action();
      const message = result.message ?? fallbackMessage;
      this.showNotice(
        result.success ? message : `Ошибка теста: ${message}`,
        result.success ? 'success' : 'error',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка проверки';
      this.showNotice(msg, 'error');
    } finally {
      onFinally();
    }
  }

  private showNotice(message: string, type: NoticeType) {
    this.notice = { message, type };
    setTimeout(() => {
      this.notice = undefined;
    }, 4000);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'system-settings-page': SystemSettingsPage;
  }
}
