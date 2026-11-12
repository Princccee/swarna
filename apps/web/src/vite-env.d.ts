/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" switches on the customer catalogue (see src/lib/features.ts) */
  readonly VITE_CUSTOMER_PORTAL?: string;
}
