import { authService, type User } from '@/lib/auth-service';
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('app-header')
export class AppHeader extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    header {
      background: var(--surface-2);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: var(--shadow-sm);
    }

    .container {
      max-width: var(--container-xl);
      margin: 0 auto;
      padding: 0 var(--spacing-md);
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--header-height);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      text-decoration: none;
      font-size: var(--font-xl);
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      cursor: pointer;
    }

    .logo:hover {
      opacity: 0.8;
    }

    nav {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    nav a {
      color: var(--text-main);
      text-decoration: none;
      padding: var(--spacing-xs) var(--spacing-md);
      border-radius: var(--radius-md);
      font-weight: 500;
      transition:
        background 0.2s,
        color 0.2s;
      font-size: var(--font-sm);
      white-space: nowrap;
    }

    nav a:hover {
      background: var(--surface-3);
    }

    nav a.active {
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      color: white;
    }

    .user-menu {
      position: relative;
    }

    .user-button {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-xs) var(--spacing-md);
      background: var(--surface-3);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: var(--text-main);
      cursor: pointer;
      transition:
        border-color 0.2s,
        background 0.2s;
      font-family: inherit;
      font-size: var(--font-sm);
    }

    .user-button:hover {
      border-color: var(--primary);
      background: var(--surface-2);
    }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: var(--font-xs);
      flex-shrink: 0;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .user-name {
      font-weight: 600;
      color: var(--text-main);
    }

    .user-role {
      font-size: var(--font-xs);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .dropdown-icon {
      transition: transform 0.2s;
    }

    .dropdown-icon.open {
      transform: rotate(180deg);
    }

    .dropdown-menu {
      position: absolute;
      top: calc(100% + var(--spacing-xs));
      right: 0;
      background: var(--surface-2);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      min-width: 220px;
      overflow: hidden;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition:
        opacity 0.2s,
        transform 0.2s,
        visibility 0.2s;
      z-index: 50;
    }

    .dropdown-menu.open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      color: var(--text-main);
      text-decoration: none;
      transition: background 0.2s;
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
      font-size: var(--font-sm);
    }

    .dropdown-item:hover {
      background: var(--surface-3);
    }

    .dropdown-divider {
      height: 1px;
      background: var(--border-color);
      margin: var(--spacing-xs) 0;
    }

    .mobile-menu-button {
      display: none;
      background: none;
      border: none;
      color: var(--text-main);
      cursor: pointer;
      padding: var(--spacing-xs);
      font-size: var(--font-2xl);
      line-height: 1;
    }

    .mobile-nav {
      display: none;
      flex-direction: column;
      gap: var(--spacing-xs);
      padding: var(--spacing-md);
      background: var(--surface-2);
      border-top: 1px solid var(--border-color);
    }

    .mobile-nav.open {
      display: flex;
    }

    .mobile-nav a {
      color: var(--text-main);
      text-decoration: none;
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      transition: background 0.2s;
      font-weight: 500;
    }

    .mobile-nav a:hover {
      background: var(--surface-3);
    }

    .mobile-nav a.active {
      background: linear-gradient(135deg, var(--primary) 0%, #764ba2 100%);
      color: white;
    }

    /* MD and below: ≤1024px - Hide desktop nav, show mobile menu button */
    @media (max-width: 1024px) {
      nav {
        display: none;
      }

      .mobile-menu-button {
        display: block;
      }
    }

    /* SM and below: ≤768px - Compact user button */
    @media (max-width: 768px) {
      .user-info {
        display: none;
      }

      .user-button {
        padding: var(--spacing-xs);
      }

      .dropdown-menu {
        min-width: 180px;
      }
    }

    /* XXS: ≤480px - Extra compact header */
    @media (max-width: 480px) {
      .container {
        padding: 0 var(--spacing-sm);
      }

      .logo {
        font-size: var(--font-lg);
      }

      .mobile-nav {
        padding: var(--spacing-sm);
      }
    }
  `;

  @state() declare private user: User | null;
  @state() declare private dropdownOpen: boolean;
  @state() declare private mobileMenuOpen: boolean;

  constructor() {
    super();
    this.user = null;
    this.dropdownOpen = false;
    this.mobileMenuOpen = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.user = authService.getUser();
    this.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      this.dropdownOpen = false;
    }
  };

  private toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  private toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  private async handleLogout() {
    try {
      await authService.logout();
      window.location.href = '/login';
    } catch (err) {
      console.error('Failed to logout:', err);
      // Force logout on client side even if server call fails
      window.location.href = '/login';
    }
  }

  private handleProfile() {
    window.location.href = '/profile';
    this.dropdownOpen = false;
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Escape closes dropdown and mobile menu
    if (e.key === 'Escape') {
      if (this.dropdownOpen) {
        this.dropdownOpen = false;
        // Return focus to user button
        const userButton = this.shadowRoot?.querySelector(
          '.user-button',
        ) as HTMLButtonElement;
        userButton?.focus();
      }
      if (this.mobileMenuOpen) {
        this.mobileMenuOpen = false;
        // Return focus to mobile menu button
        const mobileButton = this.shadowRoot?.querySelector(
          '.mobile-menu-button',
        ) as HTMLButtonElement;
        mobileButton?.focus();
      }
    }

    // Arrow down/up for dropdown navigation
    if (this.dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const dropdownItems = this.shadowRoot?.querySelectorAll(
        '.dropdown-item',
      ) as NodeListOf<HTMLButtonElement>;
      if (!dropdownItems || dropdownItems.length === 0) return;

      const activeElement = this.shadowRoot?.activeElement as HTMLElement;
      const currentIndex = Array.from(dropdownItems).indexOf(
        activeElement as HTMLButtonElement,
      );

      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % dropdownItems.length;
      } else {
        nextIndex = currentIndex <= 0 ? dropdownItems.length - 1 : currentIndex - 1;
      }

      dropdownItems[nextIndex]?.focus();
    }

    // Enter/Space on nav items
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      (e.target as HTMLElement).tagName === 'A'
    ) {
      e.preventDefault();
      (e.target as HTMLAnchorElement).click();
    }
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      student: 'Студент',
      teacher: 'Учитель',
      admin: 'Администратор',
      sysadmin: 'Системный админ',
    };
    return labels[role] || role;
  }

  private getNavItems(): Array<{ label: string; href: string; active?: boolean }> {
    const currentPath = window.location.pathname;
    const role = this.user?.role;

    const items: Array<{ label: string; href: string; active?: boolean }> = [];

    // Common for all roles
    items.push({ label: 'Главная', href: '/', active: currentPath === '/' });

    if (role === 'student') {
      // Student-specific navigation
      // items.push({ label: 'Мои курсы', href: '/my-courses', active: currentPath.startsWith('/my-courses') });
    } else if (role === 'teacher') {
      // Teacher-specific navigation
      items.push({
        label: 'Дашборд',
        href: '/teacher-dashboard',
        active: currentPath.startsWith('/teacher-dashboard'),
      });
    } else if (role === 'admin' || role === 'sysadmin') {
      // Admin-specific navigation
      items.push({
        label: 'Админ-панель',
        href: '/admin',
        active:
          currentPath.startsWith('/admin-console') || currentPath.startsWith('/admin'),
      });
    }

    return items;
  }

  render() {
    if (!this.user) {
      return html``;
    }

    const navItems = this.getNavItems();

    return html`
      <header @keydown=${this.handleKeyDown}>
        <div class="container">
          <!-- Logo -->
          <a
            class="logo"
            href="/"
            @click=${(e: Event) => {
              e.preventDefault();
              window.location.href = '/';
            }}
            aria-label="Перейти на главную страницу"
          >
            <span>TrainingGround</span>
          </a>

          <!-- Desktop Navigation -->
          <nav role="navigation" aria-label="Основная навигация">
            ${navItems.map(
              (item) => html`
                <a
                  href=${item.href}
                  class=${item.active ? 'active' : ''}
                  @click=${(e: Event) => {
                    e.preventDefault();
                    window.location.href = item.href;
                  }}
                  aria-current=${item.active ? 'page' : 'false'}
                  aria-label="${item.label}"
                >
                  ${item.label}
                </a>
              `,
            )}
          </nav>

          <!-- User Menu -->
          <div class="user-menu">
            <button
              class="user-button"
              @click=${this.toggleDropdown}
              aria-expanded="${this.dropdownOpen ? 'true' : 'false'}"
              aria-haspopup="menu"
              aria-label="Меню пользователя ${this.user.name}"
            >
              <div class="user-avatar" aria-hidden="true">
                ${this.getInitials(this.user.name)}
              </div>
              <div class="user-info">
                <span class="user-name">${this.user.name}</span>
                <span class="user-role">${this.getRoleLabel(this.user.role)}</span>
              </div>
              <span
                class="dropdown-icon ${this.dropdownOpen ? 'open' : ''}"
                aria-hidden="true"
                >▼</span
              >
            </button>

            <div
              class="dropdown-menu ${this.dropdownOpen ? 'open' : ''}"
              role="menu"
              aria-label="Меню пользователя"
            >
              <button
                class="dropdown-item"
                @click=${this.handleProfile}
                role="menuitem"
                aria-label="Перейти в профиль"
              >
                <span aria-hidden="true">👤</span>
                <span>Профиль</span>
              </button>
              <div class="dropdown-divider" role="separator" aria-hidden="true"></div>
              <button
                class="dropdown-item"
                @click=${this.handleLogout}
                role="menuitem"
                aria-label="Выйти из системы"
              >
                <span aria-hidden="true">🚪</span>
                <span>Выход</span>
              </button>
            </div>
          </div>

          <!-- Mobile Menu Button -->
          <button
            class="mobile-menu-button"
            @click=${this.toggleMobileMenu}
            aria-expanded="${this.mobileMenuOpen ? 'true' : 'false'}"
            aria-controls="mobile-navigation"
            aria-label="${this.mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}"
          >
            <span aria-hidden="true">${this.mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>

        <!-- Mobile Navigation -->
        <nav
          id="mobile-navigation"
          class="mobile-nav ${this.mobileMenuOpen ? 'open' : ''}"
          role="navigation"
          aria-label="Мобильная навигация"
          ?hidden=${!this.mobileMenuOpen}
        >
          ${navItems.map(
            (item) => html`
              <a
                href=${item.href}
                @click=${(e: Event) => {
                  e.preventDefault();
                  this.mobileMenuOpen = false;
                  window.location.href = item.href;
                }}
                aria-current=${item.active ? 'page' : 'false'}
                aria-label="${item.label}"
              >
                ${item.label}
              </a>
            `,
          )}
        </nav>
      </header>
    `;
  }
}
