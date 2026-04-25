/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_API: string
  readonly VITE_PROXY_WS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
