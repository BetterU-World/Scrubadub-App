/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_ENABLE_DEMO_MODE?: string;
  readonly VITE_ENABLE_OPERATIONS_ASSESSMENT?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
