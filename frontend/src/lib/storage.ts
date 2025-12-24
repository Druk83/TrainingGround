export const STORAGE_KEYS = {
  user: 'tg-user',
  featureFlags: 'tg-feature-flags',
  onboarding: 'tg-onboarding-complete',
} as const;

export type SerializableObject = Record<string, unknown>;
export type StorageValue =
  | string
  | number
  | boolean
  | SerializableObject
  | SerializableObject[];

export function readFromStorage<T>(key: string, fallback: T): T {
  try {
    const entry = localStorage.getItem(key);
    if (!entry) {
      return fallback;
    }
    return JSON.parse(entry) as T;
  } catch (error) {
    console.warn('Failed to read from storage', error);
    return fallback;
  }
}

export function writeToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to write to storage', error);
  }
}
