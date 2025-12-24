/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_FEATURE_FLAGS?: string;
  readonly VITE_FEATURE_HOTKEYS?: string | boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
