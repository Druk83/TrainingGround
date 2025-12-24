type FlagKey = 'offlineQueue' | 'analytics' | 'workbox' | 'experimentalHotkeys';

type FlagMap = Record<FlagKey, boolean>;

const defaultFlags: FlagMap = {
  offlineQueue: true,
  analytics: true,
  workbox: true,
  experimentalHotkeys: false,
};

const globalFlags = (
  globalThis as unknown as {
    __FEATURE_FLAGS__?: Partial<FlagMap>;
  }
).__FEATURE_FLAGS__;

const envFlags = (() => {
  try {
    const raw = import.meta.env.VITE_FEATURE_FLAGS;
    if (raw) {
      return JSON.parse(raw) as Partial<FlagMap>;
    }
  } catch (error) {
    console.warn('Failed to parse VITE_FEATURE_FLAGS', error);
  }
  return undefined;
})();

const flags: FlagMap = {
  ...defaultFlags,
  ...(envFlags ?? {}),
  ...(globalFlags ?? {}),
};

export function isFeatureEnabled(key: FlagKey) {
  return flags[key];
}

export function allFlags() {
  return { ...flags };
}
