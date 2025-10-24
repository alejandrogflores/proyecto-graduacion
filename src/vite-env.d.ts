/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FIREBASE_PROJECT_ID: string
  // ...otras VITE_*
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
