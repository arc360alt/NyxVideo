/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FREESOUND_API_KEY?: string;
  readonly VITE_PEXELS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
