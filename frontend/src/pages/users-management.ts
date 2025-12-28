import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  UserDetailResponse,
  CreateUserRequest,
  UpdateUserRequest,
  BlockUserRequest,
  ListUsersQuery,
  UserRole,
} from '@/lib/api-types';
import '@/components/app-header';

@customElement('users-management')
export class UsersManagement extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--surface-1);
      min-height: 100vh;
      color: var(--text-main);
      font-family: 'Inter', system-ui, sans-serif;
      padding: 2rem;
    }

    h1 {
      margin: 0 0 0.25rem;
      font-size: clamp(1.5rem, 3vw, 2.5rem);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .filters {
      margin: 1.5rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      display: block;
      margin-bottom: 0.5rem;
    }

    input,
    select {
      width: 100%;
      border-radius: var(--radius-medium);
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--surface-2);
      padding: 0.55rem 0.75rem;
      color: var(--text-main);
      font-size: 1rem;
    }

    button {
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: var(--radius-medium);
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    button.primary {
      background: var(--primary);
      color: white;
    }

    button.primary:hover {
      background: var(--primary-soft);
    }

    button.secondary {
      background: var(--surface-2);
      color: var(--text-main);
    }

    button.danger {
      background: var(--error);
      color: white;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface-2);
      border-radius: var(--radius-large);
      overflow: hidden;
      box-shadow: var(--shadow-soft);
    }

    th,
    td {
      text-align: left;
      padding: 0.75rem;
    }

    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .actions button {
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: var(--radius-small);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge.active {
      background: rgba(34, 197, 94, 0.2);
      color: rgb(34, 197, 94);
    }

    .badge.blocked {
      background: rgba(239, 68, 68, 0.2);
      color: rgb(239, 68, 68);
    }

    .modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .modal.open {
      display: flex;
    }

    .modal-content {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 2rem;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-content h2 {
      margin: 0 0 1.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
    }

    .error {
      color: var(--error);
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }

    .loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
    }
  `;

  @state() private users: UserDetailResponse[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private filters: ListUsersQuery = { limit: 50, offset: 0 };
  @state() private showModal = false;
  @state() private modalMode: 'create' | 'edit' | 'block' = 'create';
  @state() private selectedUser: UserDetailResponse | null = null;

  private client: ApiClient;

  constructor() {
    super();
    const token = authService.getToken();
    this.client = new ApiClient({ jwt: token ?? undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadUsers();
  }

  private async loadUsers() {
    this.loading = true;
    this.error = null;

    try {
      this.users = await this.client.listUsers(this.filters);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load users';
    } finally {
      this.loading = false;
    }
  }

  private handleFilterChange(
    field: keyof ListUsersQuery,
    value: string | boolean | undefined,
  ) {
    this.filters = { ...this.filters, [field]: value, offset: 0 };
    this.loadUsers();
  }

  private openCreateModal() {
    this.modalMode = 'create';
    this.selectedUser = null;
    this.showModal = true;
  }

  private openEditModal(user: UserDetailResponse) {
    this.modalMode = 'edit';
    this.selectedUser = user;
    this.showModal = true;
  }

  private openBlockModal(user: UserDetailResponse) {
    this.modalMode = 'block';
    this.selectedUser = user;
    this.showModal = true;
  }

  private closeModal() {
    this.showModal = false;
    this.selectedUser = null;
  }

  private handleModalBackdropKeyDown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.closeModal();
    }
  }

  private async handleCreateUser(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload: CreateUserRequest = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      name: formData.get('name') as string,
      role: formData.get('role') as UserRole,
      group_ids: [],
    };

    try {
      await this.client.createUser(payload);
      this.closeModal();
      this.loadUsers();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to create user';
    }
  }

  private async handleUpdateUser(e: Event) {
    e.preventDefault();
    if (!this.selectedUser) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload: UpdateUserRequest = {
      name: formData.get('name') as string,
      role: formData.get('role') as UserRole,
    };

    try {
      await this.client.updateUser(this.selectedUser.id, payload);
      this.closeModal();
      this.loadUsers();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to update user';
    }
  }

  private async handleBlockUser(e: Event) {
    e.preventDefault();
    if (!this.selectedUser) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload: BlockUserRequest = {
      reason: formData.get('reason') as string,
      duration_hours: formData.get('duration')
        ? Number(formData.get('duration'))
        : undefined,
    };

    try {
      await this.client.blockUser(this.selectedUser.id, payload);
      this.closeModal();
      this.loadUsers();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to block user';
    }
  }

  private async handleUnblockUser(userId: string) {
    if (!confirm('Разблокировать пользователя?')) return;

    try {
      await this.client.unblockUser(userId);
      this.loadUsers();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to unblock user';
    }
  }

  private async handleDeleteUser(userId: string) {
    if (!confirm('Удалить пользователя? Это действие необратимо.')) return;

    try {
      await this.client.deleteUser(userId);
      this.loadUsers();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to delete user';
    }
  }

  private formatDate(date: string): string {
    return new Date(date).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private renderFilters() {
    return html`
      <div class="filters">
        <div>
          <label>Поиск</label>
          <input
            type="search"
            placeholder="Email или имя"
            .value=${this.filters.search ?? ''}
            @input=${(e: Event) =>
              this.handleFilterChange('search', (e.target as HTMLInputElement).value)}
          />
        </div>

        <div>
          <label>Роль</label>
          <select
            @change=${(e: Event) =>
              this.handleFilterChange('role', (e.target as HTMLSelectElement).value)}
          >
            <option value="">Все</option>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="content_admin">Content Admin</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div>
          <label>Статус</label>
          <select
            @change=${(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              this.handleFilterChange(
                'is_blocked',
                value === '' ? undefined : value === 'true',
              );
            }}
          >
            <option value="">Все</option>
            <option value="false">Активные</option>
            <option value="true">Заблокированные</option>
          </select>
        </div>
      </div>
    `;
  }

  private renderTable() {
    if (this.loading) {
      return html`<div class="loading">Загрузка...</div>`;
    }

    if (this.users.length === 0) {
      return html`<div class="loading">Пользователи не найдены</div>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Имя</th>
            <th>Роль</th>
            <th>Статус</th>
            <th>Создан</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${this.users.map(
            (user) => html`
              <tr>
                <td>${user.email}</td>
                <td>${user.name}</td>
                <td>${user.role}</td>
                <td>
                  <span class="badge ${user.is_blocked ? 'blocked' : 'active'}">
                    ${user.is_blocked ? 'Заблокирован' : 'Активен'}
                  </span>
                </td>
                <td>${this.formatDate(user.created_at)}</td>
                <td>
                  <div class="actions">
                    <button class="secondary" @click=${() => this.openEditModal(user)}>
                      Изменить
                    </button>
                    ${user.is_blocked
                      ? html`
                          <button
                            class="primary"
                            @click=${() => this.handleUnblockUser(user.id)}
                          >
                            Разблокировать
                          </button>
                        `
                      : html`
                          <button
                            class="secondary"
                            @click=${() => this.openBlockModal(user)}
                          >
                            Заблокировать
                          </button>
                        `}
                    <button class="danger" @click=${() => this.handleDeleteUser(user.id)}>
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  private renderModal() {
    if (!this.showModal) return null;

    if (this.modalMode === 'create') {
      const titleId = 'create-user-modal-title';
      return html`
        <div
          class="modal open"
          role="dialog"
          aria-modal="true"
          aria-labelledby=${titleId}
          tabindex="0"
          @click=${(e: Event) => e.target === e.currentTarget && this.closeModal()}
          @keydown=${this.handleModalBackdropKeyDown}
        >
          <div class="modal-content">
            <h2 id=${titleId}>Создать пользователя</h2>
            <form @submit=${this.handleCreateUser}>
              <div class="form-group">
                <label>Email</label>
                <input type="email" name="email" required />
              </div>

              <div class="form-group">
                <label>Пароль</label>
                <input type="password" name="password" minlength="8" required />
              </div>

              <div class="form-group">
                <label>Имя</label>
                <input type="text" name="name" required />
              </div>

              <div class="form-group">
                <label>Роль</label>
                <select name="role" required>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="content_admin">Content Admin</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              ${this.error ? html`<div class="error">${this.error}</div>` : null}

              <div class="form-actions">
                <button type="button" class="secondary" @click=${this.closeModal}>
                  Отмена
                </button>
                <button type="submit" class="primary">Создать</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (this.modalMode === 'edit' && this.selectedUser) {
      const titleId = 'edit-user-modal-title';
      return html`
        <div
          class="modal open"
          role="dialog"
          aria-modal="true"
          aria-labelledby=${titleId}
          tabindex="0"
          @click=${(e: Event) => e.target === e.currentTarget && this.closeModal()}
          @keydown=${this.handleModalBackdropKeyDown}
        >
          <div class="modal-content">
            <h2 id=${titleId}>Редактировать пользователя</h2>
            <form @submit=${this.handleUpdateUser}>
              <div class="form-group">
                <label>Email (только для чтения)</label>
                <input type="email" .value=${this.selectedUser.email} disabled />
              </div>

              <div class="form-group">
                <label>Имя</label>
                <input
                  type="text"
                  name="name"
                  .value=${this.selectedUser.name}
                  required
                />
              </div>

              <div class="form-group">
                <label>Роль</label>
                <select name="role" .value=${this.selectedUser.role} required>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="content_admin">Content Admin</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              ${this.error ? html`<div class="error">${this.error}</div>` : null}

              <div class="form-actions">
                <button type="button" class="secondary" @click=${this.closeModal}>
                  Отмена
                </button>
                <button type="submit" class="primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    if (this.modalMode === 'block' && this.selectedUser) {
      const titleId = 'block-user-modal-title';
      return html`
        <div
          class="modal open"
          role="dialog"
          aria-modal="true"
          aria-labelledby=${titleId}
          tabindex="0"
          @click=${(e: Event) => e.target === e.currentTarget && this.closeModal()}
          @keydown=${this.handleModalBackdropKeyDown}
        >
          <div class="modal-content">
            <h2 id=${titleId}>Заблокировать пользователя</h2>
            <form @submit=${this.handleBlockUser}>
              <div class="form-group">
                <label>Пользователь</label>
                <input
                  type="text"
                  .value=${`${this.selectedUser.name} (${this.selectedUser.email})`}
                  disabled
                />
              </div>

              <div class="form-group">
                <label>Причина</label>
                <input type="text" name="reason" required />
              </div>

              <div class="form-group">
                <label
                  >Длительность (часы, оставьте пустым для постоянной блокировки)</label
                >
                <input type="number" name="duration" min="1" />
              </div>

              ${this.error ? html`<div class="error">${this.error}</div>` : null}

              <div class="form-actions">
                <button type="button" class="secondary" @click=${this.closeModal}>
                  Отмена
                </button>
                <button type="submit" class="danger">Заблокировать</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    return null;
  }

  render() {
    return html`
      <app-header></app-header>

      <div class="header">
        <div>
          <h1>Управление пользователями</h1>
          <p style="color: var(--text-muted); margin: 0;">
            Создание, редактирование и управление пользователями
          </p>
        </div>
        <button class="primary" @click=${this.openCreateModal}>
          Создать пользователя
        </button>
      </div>

      ${this.renderFilters()} ${this.renderTable()} ${this.renderModal()}
    `;
  }
}
