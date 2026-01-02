/**
 * Feature Flags initialization for frontend app
 *
 * This module initializes the feature flags service when the app starts.
 * Should be called in main.ts after authentication is available.
 */

import { initializeFeatureFlags } from '@/services/featureFlags';

/**
 * Initialize feature flags after user authentication
 *
 * Call this function after user has been authenticated and their
 * userId and groupId are available.
 *
 * Example usage in main.ts:
 * ```typescript
 * import { useAuth } from '@/composables/useAuth';
 * import { initializeFeatureFlags } from '@/services/featureFlags';
 *
 * // After mounting the app and authenticating the user:
 * const { user, group } = useAuth();
 * await initializeFeatureFlags(user.id, group?.id);
 * ```
 */
export async function setupFeatureFlags() {
  try {
    // Try to get user info from local storage or auth service
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    const groupJson = localStorage.getItem('current_group');
    const group = groupJson ? JSON.parse(groupJson) : null;

    const userId = user?.id ?? null;
    const groupId = group?.id ?? null;

    // Initialize feature flags service
    await initializeFeatureFlags(userId, groupId, true);

    console.log('[App] Feature flags initialized successfully', {
      userId,
      groupId,
    });
  } catch (error) {
    console.warn('[App] Failed to initialize feature flags:', error);
    // Continue app startup even if flags initialization fails
  }
}

/**
 * Handle user authentication changes
 * Re-initialize feature flags with new user context
 */
export function onAuthChanged(userId: string | null, groupId: string | null) {
  initializeFeatureFlags(userId, groupId, true);
}
