/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FREESOUND_API_KEY?: string;
  readonly VITE_PEXELS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Not yet in TypeScript's DOM lib. Chromium-based browsers only; feature-detect with 'EyeDropper' in window.
interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}
interface Window {
  EyeDropper?: { new (): EyeDropper };
}
