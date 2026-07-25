import { newId } from './id';
import { probeMediaFile } from './mediaProbe';
import type { MediaAsset } from '../types';

const PHOTO_API = 'https://api.pexels.com/v1';
const VIDEO_API = 'https://api.pexels.com/videos';
const API_KEY_STORAGE = 'nyxvideo:pexelsApiKey';
const PAGE_SIZE = 20;

export interface PexelsPhotoResult {
  kind: 'photo';
  id: number;
  width: number;
  height: number;
  photographer: string;
  alt: string;
  thumbnailUrl: string;
  downloadUrl: string;
}

export interface PexelsVideoResult {
  kind: 'video';
  id: number;
  width: number;
  height: number;
  duration: number;
  photographer: string;
  thumbnailUrl: string;
  downloadUrl: string;
}

export type PexelsResult = PexelsPhotoResult | PexelsVideoResult;

export interface PexelsSearchPage {
  results: PexelsResult[];
  hasMore: boolean;
}

export function hasEnvApiKey(): boolean {
  return !!import.meta.env.VITE_PEXELS_API_KEY;
}

export function getPexelsApiKey(): string {
  return import.meta.env.VITE_PEXELS_API_KEY || localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setPexelsApiKey(key: string) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

/** Picks a reasonably-sized video file to download — avoids 4K/UHD originals when a smaller rendition exists. */
function pickVideoFile(
  files: { quality: string; file_type: string; width: number | null; height: number | null; link: string }[],
): { link: string; width: number; height: number } | null {
  const mp4s = files.filter((f) => f.file_type === 'video/mp4' && f.width && f.height);
  if (mp4s.length === 0) return null;
  const hd = mp4s.find((f) => f.quality === 'hd' && f.width! <= 1920);
  const sd = mp4s.find((f) => f.quality === 'sd');
  const chosen = hd ?? sd ?? mp4s[0];
  return { link: chosen.link, width: chosen.width!, height: chosen.height! };
}

async function pexelsFetch(url: string): Promise<Response> {
  const key = getPexelsApiKey();
  if (!key) throw new Error('Add a Pexels API key above first.');
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Pexels rejected that API key — double-check it above.');
    if (res.status === 429) throw new Error('Pexels rate limit hit — wait a bit and try again.');
    throw new Error(`Pexels search failed (${res.status})`);
  }
  return res;
}

export async function searchPexelsPhotos(query: string, page = 1): Promise<PexelsSearchPage> {
  if (!query.trim()) return { results: [], hasMore: false };
  const url = `${PHOTO_API}/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${PAGE_SIZE}`;
  const res = await pexelsFetch(url);
  const data = await res.json();
  const results: PexelsResult[] = (data.photos ?? []).map(
    (p: {
      id: number;
      width: number;
      height: number;
      photographer: string;
      alt: string;
      src: { medium: string; large2x: string; original: string };
    }) => ({
      kind: 'photo',
      id: p.id,
      width: p.width,
      height: p.height,
      photographer: p.photographer,
      alt: p.alt || 'Pexels photo',
      thumbnailUrl: p.src.medium,
      downloadUrl: p.src.large2x || p.src.original,
    }),
  );
  return { results, hasMore: !!data.next_page };
}

export async function searchPexelsVideos(query: string, page = 1): Promise<PexelsSearchPage> {
  if (!query.trim()) return { results: [], hasMore: false };
  const url = `${VIDEO_API}/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${PAGE_SIZE}`;
  const res = await pexelsFetch(url);
  const data = await res.json();
  const results: PexelsResult[] = (data.videos ?? [])
    .map(
      (v: {
        id: number;
        width: number;
        height: number;
        duration: number;
        image: string;
        user: { name: string };
        video_files: { quality: string; file_type: string; width: number | null; height: number | null; link: string }[];
      }) => {
        const file = pickVideoFile(v.video_files);
        if (!file) return null;
        const result: PexelsVideoResult = {
          kind: 'video',
          id: v.id,
          width: file.width,
          height: file.height,
          duration: v.duration,
          photographer: v.user.name,
          thumbnailUrl: v.image,
          downloadUrl: file.link,
        };
        return result;
      },
    )
    .filter((r: PexelsVideoResult | null): r is PexelsVideoResult => r !== null);
  return { results, hasMore: !!data.next_page };
}

const assetCache = new Map<string, Promise<MediaAsset>>();

/**
 * Downloads a Pexels photo or video as a local blob and probes it into a MediaAsset, exactly like an
 * uploaded file — once fetched, it's a normal local asset with no further dependency on Pexels'
 * availability. Cached per result so adding the same one twice doesn't re-download it.
 */
export function fetchPexelsAsset(result: PexelsResult): Promise<MediaAsset> {
  const cacheKey = `${result.kind}:${result.id}`;
  let promise = assetCache.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      const res = await fetch(result.downloadUrl);
      if (!res.ok) throw new Error(`Could not download from Pexels (${res.status})`);
      const blob = await res.blob();
      const ext = result.kind === 'photo' ? 'jpg' : 'mp4';
      const type = result.kind === 'photo' ? 'image/jpeg' : 'video/mp4';
      const file = new File([blob], `pexels-${result.id}.${ext}`, { type: blob.type || type });
      const asset = await probeMediaFile(file);
      return {
        ...asset,
        id: newId(),
        attribution: `Photo/video by ${result.photographer} on Pexels`,
      };
    })();
    assetCache.set(cacheKey, promise);
    promise.catch(() => assetCache.delete(cacheKey));
  }
  return promise;
}
