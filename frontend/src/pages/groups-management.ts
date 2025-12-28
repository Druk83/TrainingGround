import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  GroupResponse,
  CreateGroupRequest,
  UpdateGroupRequest,
  ListGroupsQuery,
  UserDetailResponse,
} from '@/lib/api-types';

import '../components/app-header';

@customElement('groups-management')
export class GroupsManagement extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--background-color, #f5f5f5);
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 2rem;
      color: var(--text-primary, #333);
    }

    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .filters {
      display: flex;
      gap: 1rem;
      flex: 1;
      flex-wrap: wrap;
    }

    input[type='text'],
    input[type='email'],
    input[type='password'],
    input[type='number'],
    select,
    textarea {
      padding: 0.5rem;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 4px;
      font-size: 1rem;
      min-width: 200px;
    }

    textarea {
      min-height: 80px;
      resize: vertical;
      font-family: inherit;
    }

    button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-primary {
      background-color: var(--primary-color, #007bff);
      color: white;
    }

    .btn-primary:hover {
      background-color: var(--primary-hover, #0056b3);
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      color: white;
    }

    .btn-secondary:hover {
      background-color: var(--secondary-hover, #5a6268);
    }

    .btn-danger {
      background-color: var(--danger-color, #dc3545);
      color: white;
    }

    .btn-danger:hover {
      background-color: var(--danger-hover, #c82333);
    }

    .btn-small {
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
    }

    .table-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background-color: var(--table-header-bg, #f8f9fa);
    }

    th,
    td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color, #ddd);
    }

    th {
      font-weight: 600;
      color: var(--text-secondary, #666);
    }

    tbody tr:hover {
      background-color: var(--table-row-hover, #f8f9fa);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .error {
      background-color: #f8d7da;
      color: #721c24;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    .loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary, #666);
    }

    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary, #666);
    }

    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      padding: 2rem;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-secondary, #666);
      padding: 0;
      width: 2rem;
      height: 2rem;
    }

    .close-btn:hover {
      color: var(--text-primary, #333);
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-primary, #333);
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      box-sizing: border-box;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
    }

    .student-count {
      font-weight: 500;
      color: var(--primary-color, #007bff);
    }
  `;

  @state() private groups: GroupResponse[] = [];
  @state() private curators: UserDetailResponse[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private filters: ListGroupsQuery = { limit: 50, offset: 0 };
  @state() private showModal = false;
  @state() private modalMode: 'create' | 'edit' = 'create';
  @state() private selectedGroup: GroupResponse | null = null;

  private apiClient: ApiClient;

  constructor() {
    super();
    this.apiClient = new ApiClient({ jwt: authService.getToken() || undefined });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadGroups();
    this.loadCurators();
  }

  private async loadGroups() {
    this.loading = true;
    this.error = null;
    try {
      this.groups = await this.apiClient.listGroups(this.filters);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load groups';
    } finally {
      this.loading = false;
    }
  }

  private async loadCurators() {
    try {
      const allCurators = await this.apiClient.listUsers({
        role: 'teacher',
        limit: 1000,
      });
      this.curators = allCurators;
    } catch (err) {
      console.error('Failed to load curators:', err);
    }
  }

  private openCreateModal() {
    this.modalMode = 'create';
    this.selectedGroup = null;
    this.showModal = true;
  }

  private openEditModal(group: GroupResponse) {
    this.modalMode = 'edit';
    this.selectedGroup = group;
    this.showModal = true;
  }

  private closeModal() {
    this.showModal = false;
    this.selectedGroup = null;
  }

  private async handleCreateGroup(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload: CreateGroupRequest = {
      name: formData.get('name') as string,
      school: formData.get('school') as string,
      curator_id: (formData.get('curator_id') as string) || undefined,
      description: (formData.get('description') as string) || undefined,
    };

    try {
      await this.apiClient.createGroup(payload);
      this.closeModal();
      await this.loadGroups();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to create group';
    }
  }

  private async handleUpdateGroup(e: Event) {
    e.preventDefault();
    if (!this.selectedGroup) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const payload: UpdateGroupRequest = {
      name: formData.get('name') as string,
      school: formData.get('school') as string,
      curator_id: (formData.get('curator_id') as string) || undefined,
      description: (formData.get('description') as string) || undefined,
    };

    try {
      await this.apiClient.updateGroup(this.selectedGroup.id, payload);
      this.closeModal();
      await this.loadGroups();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to update group';
    }
  }

  private async handleDeleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await this.apiClient.deleteGroup(groupId);
      await this.loadGroups();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to delete group';
    }
  }

  private handleSearchChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.filters = { ...this.filters, search: input.value || undefined, offset: 0 };
    this.loadGroups();
  }

  private handleSchoolChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.filters = { ...this.filters, school: select.value || undefined, offset: 0 };
    this.loadGroups();
  }

  private handleCuratorChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.filters = { ...this.filters, curator_id: select.value || undefined, offset: 0 };
    this.loadGroups();
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private getUniqueSchools(): string[] {
    const schools = new Set(this.groups.map((g) => g.school));
    return Array.from(schools).sort();
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

  render() {
    return html`
      <app-header></app-header>
      <div class="container">
        <h1>Groups Management</h1>

        ${this.error ? html`<div class="error">${this.error}</div>` : ''}

        <div class="controls">
          <div class="filters">
            <input
              type="text"
              placeholder="Search by name..."
              @input=${this.handleSearchChange}
              .value=${this.filters.search || ''}
            />

            <select @change=${this.handleSchoolChange}>
              <option value="">All schools</option>
              ${this.getUniqueSchools().map(
                (school) => html`<option value=${school}>${school}</option>`,
              )}
            </select>

            <select @change=${this.handleCuratorChange}>
              <option value="">All curators</option>
              ${this.curators.map(
                (curator) => html`<option value=${curator.id}>${curator.name}</option>`,
              )}
            </select>
          </div>

          <button class="btn-primary" @click=${this.openCreateModal}>Create Group</button>
        </div>

        ${this.loading
          ? html`<div class="loading">Loading groups...</div>`
          : this.groups.length === 0
            ? html`<div class="empty">No groups found</div>`
            : html`
                <div class="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>School</th>
                        <th>Curator</th>
                        <th>Students</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.groups.map(
                        (group) => html`
                          <tr>
                            <td>${group.name}</td>
                            <td>${group.school}</td>
                            <td>${group.curator_name || '-'}</td>
                            <td>
                              <span class="student-count">${group.student_count}</span>
                            </td>
                            <td>${this.formatDate(group.created_at)}</td>
                            <td>
                              <div class="actions">
                                <button
                                  class="btn-secondary btn-small"
                                  @click=${() => this.openEditModal(group)}
                                >
                                  Edit
                                </button>
                                <button
                                  class="btn-danger btn-small"
                                  @click=${() =>
                                    this.handleDeleteGroup(group.id, group.name)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `}
        ${this.showModal ? this.renderModal() : ''}
      </div>
    `;
  }

  private renderModal() {
    const isCreate = this.modalMode === 'create';
    const title = isCreate ? 'Create Group' : 'Edit Group';
    const modalTitleId = isCreate ? 'group-modal-title-create' : 'group-modal-title-edit';

    return html`
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby=${modalTitleId}
        tabindex="0"
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.closeModal();
        }}
        @keydown=${this.handleModalBackdropKeyDown}
      >
        <div class="modal-content">
          <div class="modal-header">
            <h2 id=${modalTitleId}>${title}</h2>
            <button class="close-btn" @click=${this.closeModal}>&times;</button>
          </div>

          <form @submit=${isCreate ? this.handleCreateGroup : this.handleUpdateGroup}>
            <div class="form-group">
              <label for="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                .value=${this.selectedGroup?.name || ''}
              />
            </div>

            <div class="form-group">
              <label for="school">School *</label>
              <input
                type="text"
                id="school"
                name="school"
                required
                .value=${this.selectedGroup?.school || ''}
              />
            </div>

            <div class="form-group">
              <label for="curator_id">Curator</label>
              <select
                id="curator_id"
                name="curator_id"
                .value=${this.selectedGroup?.curator_id || ''}
              >
                <option value="">No curator</option>
                ${this.curators.map(
                  (curator) => html`
                    <option
                      value=${curator.id}
                      ?selected=${this.selectedGroup?.curator_id === curator.id}
                    >
                      ${curator.name} (${curator.email})
                    </option>
                  `,
                )}
              </select>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea
                id="description"
                name="description"
                .value=${this.selectedGroup?.description || ''}
              ></textarea>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-secondary" @click=${this.closeModal}>
                Cancel
              </button>
              <button type="submit" class="btn-primary">
                ${isCreate ? 'Create' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'groups-management': GroupsManagement;
  }
}
