/**
 * Feature Flags Service for PWA
 *
 * Manages client-side feature flag state with localStorage caching and auto-refresh.
 * Provides composable-like functions for easy integration into components.
 */

/**
 * Represents a single feature flag
 */
export interface FeatureFlag {
  flag_key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Feature flags response from API
 */
export interface FeatureFlagsResponse {
  flags: FeatureFlag[];
}

/**
 * Feature flags store state
 */
interface FlagState {
  flags: Map<string, FeatureFlag>;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

type StateListener = (state: FlagState) => void;

const STORAGE_KEY = 'trainingground_feature_flags';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Singleton feature flags service
 */
class FeatureFlagsService {
  private state: FlagState = {
    flags: new Map<string, FeatureFlag>(),
    loading: false,
    error: null,
    lastUpdated: null,
  };

  private userId: string | null = null;
  private groupId: string | null = null;
  private refreshInterval: number | null = null;
  private listeners: Set<StateListener> = new Set();

  constructor() {
    // Load from localStorage on initialization
    this.loadFromStorage();
  }

  /**
   * Initialize service with user context
   */
  initialize(userId: string | null, groupId: string | null): void {
    this.userId = userId;
    this.groupId = groupId;
  }

  /**
   * Fetch feature flags from API
   */
  async fetch(): Promise<void> {
    if (this.state.loading) {
      return; // Prevent concurrent requests
    }

    try {
      this.state.loading = true;
      this.state.error = null;

      const params = new URLSearchParams();
      if (this.userId) {
        params.append('user_id', this.userId);
      }
      if (this.groupId) {
        params.append('group_id', this.groupId);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/feature-flags?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data: FeatureFlagsResponse = await response.json();

      // Update state
      this.state.flags.clear();
      for (const flag of data.flags) {
        this.state.flags.set(flag.flag_key, flag);
      }

      this.state.lastUpdated = Date.now();

      // Save to localStorage
      this.saveToStorage();

      // Notify listeners
      this.notifyListeners();

      console.log('[FeatureFlags] Fetched and cached flags', {
        count: data.flags.length,
        flags: Array.from(this.state.flags.keys()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.error = message;
      console.error('[FeatureFlags] Failed to fetch flags:', message);

      // Try to load from localStorage as fallback
      this.loadFromStorage();
    } finally {
      this.state.loading = false;
      this.notifyListeners();
    }
  }

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flagKey: string): boolean {
    const flag = this.state.flags.get(flagKey);
    return flag?.enabled ?? false;
  }

  /**
   * Get flag configuration
   */
  getConfig(flagKey: string): Record<string, unknown> {
    const flag = this.state.flags.get(flagKey);
    return flag?.config ?? {};
  }

  /**
   * Get all enabled flags
   */
  getEnabledFlags(): FeatureFlag[] {
    return Array.from(this.state.flags.values()).filter((flag) => flag.enabled);
  }

  /**
   * Get flag by key
   */
  getFlag(flagKey: string): FeatureFlag | undefined {
    return this.state.flags.get(flagKey);
  }

  /**
   * Save flags to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        flags: Array.from(this.state.flags.values()),
        lastUpdated: this.state.lastUpdated,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[FeatureFlags] Failed to save to localStorage:', error);
    }
  }

  /**
   * Load flags from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }

      const data = JSON.parse(stored);
      const lastUpdated = data.lastUpdated ?? 0;

      // Check if cache is still valid
      const isExpired = Date.now() - lastUpdated > CACHE_TTL_MS;
      if (isExpired) {
        console.log('[FeatureFlags] Cache expired, will refresh on next fetch');
        return;
      }

      // Restore flags from storage
      this.state.flags.clear();
      for (const flag of data.flags || []) {
        this.state.flags.set(flag.flag_key, flag);
      }

      this.state.lastUpdated = lastUpdated;
      console.log('[FeatureFlags] Loaded flags from localStorage', {
        count: data.flags?.length || 0,
      });
    } catch (error) {
      console.warn('[FeatureFlags] Failed to load from localStorage:', error);
    }
  }

  /**
   * Get read-only state
   */
  getState(): Readonly<FlagState> {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.getState()));
  }

  /**
   * Start auto-refresh interval (useful for detecting flag changes)
   */
  startAutoRefresh(intervalMs: number = 60000): void {
    if (this.refreshInterval) {
      return; // Already running
    }

    this.refreshInterval = window.setInterval(() => {
      this.fetch();
    }, intervalMs);

    console.log('[FeatureFlags] Auto-refresh started every', intervalMs, 'ms');
  }

  /**
   * Stop auto-refresh interval
   */
  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('[FeatureFlags] Auto-refresh stopped');
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.state.flags.clear();
    this.state.lastUpdated = null;
    localStorage.removeItem(STORAGE_KEY);
    console.log('[FeatureFlags] Cache cleared');
  }
}

// Create singleton instance
const featureFlagsService = new FeatureFlagsService();

/**
 * Composable-like function for using feature flags in components
 *
 * Example:
 * ```typescript
 * const { isEnabled, getConfig } = useFeatureFlags();
 *
 * if (isEnabled('hints_enabled')) {
 *   // Show hints button
 * }
 * ```
 */
export function useFeatureFlags() {
  const _state = featureFlagsService.getState();

  return {
    // State (as getters for current values)
    get flags(): Map<string, FeatureFlag> {
      return featureFlagsService.getState().flags;
    },
    get loading(): boolean {
      return featureFlagsService.getState().loading;
    },
    get error(): string | null {
      return featureFlagsService.getState().error;
    },
    get lastUpdated(): number | null {
      return featureFlagsService.getState().lastUpdated;
    },

    // Methods
    isEnabled: (flagKey: string): boolean => featureFlagsService.isEnabled(flagKey),
    getConfig: (flagKey: string): Record<string, unknown> =>
      featureFlagsService.getConfig(flagKey),
    getEnabledFlags: (): FeatureFlag[] => featureFlagsService.getEnabledFlags(),
    getFlag: (flagKey: string): FeatureFlag | undefined =>
      featureFlagsService.getFlag(flagKey),
    fetch: (): Promise<void> => featureFlagsService.fetch(),
    clearCache: (): void => featureFlagsService.clearCache(),
    subscribe: (listener: StateListener): (() => void) =>
      featureFlagsService.subscribe(listener),
  };
}

/**
 * Initialize feature flags service with user context
 * Should be called once during app initialization
 */
export async function initializeFeatureFlags(
  userId: string | null = null,
  groupId: string | null = null,
  autoRefresh: boolean = true,
): Promise<void> {
  featureFlagsService.initialize(userId, groupId);

  // Fetch initial flags
  await featureFlagsService.fetch();

  // Start auto-refresh if enabled
  if (autoRefresh) {
    featureFlagsService.startAutoRefresh(60000); // Refresh every minute
  }

  console.log('[FeatureFlags] Service initialized', {
    userId,
    groupId,
    autoRefresh,
  });
}

/**
 * Singleton service export for direct access
 */
export { featureFlagsService };

/**
 * Utility: Check multiple flags with AND logic
 */
export function allEnabled(...flagKeys: string[]): boolean {
  return flagKeys.every((key) => featureFlagsService.isEnabled(key));
}

/**
 * Utility: Check multiple flags with OR logic
 */
export function anyEnabled(...flagKeys: string[]): boolean {
  return flagKeys.some((key) => featureFlagsService.isEnabled(key));
}
