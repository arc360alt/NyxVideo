import { newId } from './id';
import { probeMediaFile } from './mediaProbe';
import type { MediaAsset } from '../types';

const API_BASE = 'https://freesound.org/apiv2';
const API_KEY_STORAGE = 'nyxvideo:freesoundApiKey';
const RESULT_FIELDS = 'id,name,username,duration,previews,license,tags';
const PAGE_SIZE = 20;

export interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  duration: number;
  previewUrl: string;
  license: string;
  tags: string[];
}

export interface FreesoundSearchPage {
  results: FreesoundResult[];
  count: number;
  hasMore: boolean;
}

/** True when a key is baked in via VITE_FREESOUND_API_KEY (a .env file), shared by everyone running this build. */
export function hasEnvApiKey(): boolean {
  return !!import.meta.env.VITE_FREESOUND_API_KEY;
}

export function getFreesoundApiKey(): string {
  return import.meta.env.VITE_FREESOUND_API_KEY || localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setFreesoundApiKey(key: string) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

/** Shortens a Creative Commons license URL (e.g. "https://creativecommons.org/licenses/by/3.0/") to "CC BY 3.0". */
export function shortenLicense(license: string): string {
  const m = license.match(/creativecommons\.org\/(?:licenses|publicdomain)\/([\w-]+)\/([\d.]+)/i);
  if (!m) return license;
  const [, code, version] = m;
  if (code === 'zero') return `CC0 ${version}`;
  return `CC ${code.toUpperCase()} ${version}`;
}

export async function searchFreesound(query: string, page = 1): Promise<FreesoundSearchPage> {
  const key = getFreesoundApiKey();
  if (!key) throw new Error('Add a Freesound API key above first.');
  if (!query.trim()) return { results: [], count: 0, hasMore: false };

  const url = new URL(`${API_BASE}/search/text/`);
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  url.searchParams.set('fields', RESULT_FIELDS);

  const res = await fetch(url.toString(), { headers: { Authorization: `Token ${key}` } });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Freesound rejected that API key — double-check it above.');
    if (res.status === 429) throw new Error('Freesound rate limit hit — wait a bit and try again.');
    throw new Error(`Freesound search failed (${res.status})`);
  }

  const data = await res.json();
  const results: FreesoundResult[] = (data.results ?? []).map(
    (r: {
      id: number;
      name: string;
      username: string;
      duration: number;
      previews: Record<string, string>;
      license: string;
      tags?: string[];
    }) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      duration: r.duration,
      previewUrl: r.previews['preview-hq-mp3'] ?? r.previews['preview-lq-mp3'],
      license: r.license,
      tags: r.tags ?? [],
    }),
  );
  return { results, count: data.count ?? 0, hasMore: !!data.next };
}

const assetCache = new Map<number, Promise<MediaAsset>>();

/**
 * Downloads a Freesound preview as a local blob and probes it into a MediaAsset, exactly like an
 * uploaded file — once fetched, it's a normal local asset (persisted, decodable for waveforms/export)
 * with no further dependency on Freesound's CORS policy or availability. Cached per sound id so
 * adding the same result to the timeline twice doesn't re-download it.
 */
export function fetchFreesoundAsset(result: FreesoundResult): Promise<MediaAsset> {
  let promise = assetCache.get(result.id);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(result.previewUrl);
      if (!res.ok) throw new Error(`Could not download "${result.name}" from Freesound (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], `${result.name}.mp3`, { type: blob.type || 'audio/mpeg' });
      const asset = await probeMediaFile(file);
      return {
        ...asset,
        id: newId(),
        attribution: `"${result.name}" by ${result.username} (Freesound, ${shortenLicense(result.license)})`,
      };
    })();
    assetCache.set(result.id, promise);
    promise.catch(() => assetCache.delete(result.id));
  }
  return promise;
}
