type FlagKey = 'offlineQueue' | 'analytics' | 'workbox' | 'hotkeys' | 'sso';

type FlagMap = Record<FlagKey, boolean>;

const defaultFlags: FlagMap = {
  offlineQueue: true,
  analytics: true,
  workbox: true,
  hotkeys: false,
  sso: false,
};

const globalFlags = (
  (globalThis as unknown as { __FEATURE_FLAGS__?: Partial<FlagMap> }) || {}
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

const explicitHotkeys = (() => {
  const value = import.meta.env.VITE_FEATURE_HOTKEYS;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return value.toString().toLowerCase() === 'true';
})();

const explicitSso = (() => {
  const value = import.meta.env.VITE_FEATURE_SSO;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return value.toString().toLowerCase() === 'true';
})();

const flags: FlagMap = {
  ...defaultFlags,
  ...(envFlags ?? {}),
  ...(globalFlags ?? {}),
};

if (typeof explicitHotkeys === 'boolean') {
  flags.hotkeys = explicitHotkeys;
}
if (typeof explicitSso === 'boolean') {
  flags.sso = explicitSso;
}

export function isFeatureEnabled(key: FlagKey) {
  return flags[key];
}

export function allFlags() {
  return { ...flags };
}
