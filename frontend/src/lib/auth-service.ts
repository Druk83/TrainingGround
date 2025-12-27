import { ApiClient } from './api-client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  group_ids: string[];
  created_at: string;
  last_login_at?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export class AuthService {
  private static readonly TOKEN_KEY = 'access_token';
  private static readonly USER_KEY = 'user';
  private apiClient: ApiClient;

  constructor(apiClient?: ApiClient) {
    this.apiClient = apiClient || new ApiClient();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem(AuthService.TOKEN_KEY);
  }

  /**
   * Get current user from localStorage
   */
  getUser(): User | null {
    try {
      const userStr = localStorage.getItem(AuthService.USER_KEY);
      if (userStr) {
        return JSON.parse(userStr) as User;
      }
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
    }
    return null;
  }

  /**
   * Get current access token
   */
  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    return user ? roles.includes(user.role) : false;
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
      credentials: 'include', // Include cookies in request
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(errorData.message || `Login failed with status ${response.status}`);
    }

    const data: AuthResponse = await response.json();

    // Save token and user to localStorage (refresh_token is in HTTP-only cookie)
    this.setAuthData(data.access_token, data.user);

    // Fetch CSRF token for authenticated requests
    await this.apiClient.fetchCsrfToken();

    return data;
  }

  /**
   * Register new user
   */
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
      credentials: 'include', // Include cookies in request
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'Registration failed' }));
      throw new Error(
        errorData.message || `Registration failed with status ${response.status}`,
      );
    }

    const data: AuthResponse = await response.json();

    // Save token and user to localStorage (refresh_token is in HTTP-only cookie)
    this.setAuthData(data.access_token, data.user);

    // Fetch CSRF token for authenticated requests
    await this.apiClient.fetchCsrfToken();

    return data;
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      // Call logout endpoint to revoke refresh token
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include cookies in request
      });
    } catch (err) {
      console.error('Failed to logout on server:', err);
      // Continue with client-side logout even if server call fails
    }

    // Clear local storage
    this.clearAuthData();
  }

  /**
   * Refresh access token (refresh_token read from HTTP-only cookie)
   */
  async refreshToken(): Promise<string> {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include cookies in request
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    const newToken = data.access_token;

    // Update token in localStorage
    localStorage.setItem(AuthService.TOKEN_KEY, newToken);
    this.apiClient.setToken(newToken);

    return newToken;
  }

  /**
   * Get current user profile from API
   */
  async getCurrentUser(): Promise<User> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/v1/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    const user: User = await response.json();

    // Update user in localStorage
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));

    return user;
  }

  /**
   * Redirect to login page
   */
  redirectToLogin(): void {
    window.location.href = '/login';
  }

  /**
   * Redirect to home based on user role
   */
  redirectToHome(): void {
    const user = this.getUser();
    if (!user) {
      this.redirectToLogin();
      return;
    }

    switch (user.role) {
      case 'admin':
      case 'sysadmin':
        window.location.href = '/admin-console';
        break;
      case 'teacher':
        window.location.href = '/teacher-dashboard';
        break;
      default:
        window.location.href = '/';
        break;
    }
  }

  /**
   * Set auth data in localStorage and API client
   */
  private setAuthData(token: string, user: User): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
    this.apiClient.setToken(token);
  }

  /**
   * Clear auth data from localStorage
   */
  private clearAuthData(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    this.apiClient.setToken(undefined);
  }
}

// Export singleton instance
export const authService = new AuthService();
