/// <reference types="vite/client" />

interface ImportMeta {
  readonly ssr: boolean
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_SITE_URL?: string
}

