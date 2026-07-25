import { Input, UrlSource, ALL_FORMATS, CanvasSink, type WrappedCanvas } from 'mediabunny';
import type { MediaAsset, MediaClip, Project } from '../types';
import { isClipActive } from './clipUtils';

export interface ActiveVideoEntry {
  clip: MediaClip;
  asset: MediaAsset;
  sourceTime: number;
}

/** Every video clip active at time `t`, with the exact source timestamp each one needs. */
export function getActiveVideoEntries(project: Project, t: number, assetById: Map<string, MediaAsset>): ActiveVideoEntry[] {
  const entries: ActiveVideoEntry[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== 'video') continue;
      const mc = clip as MediaClip;
      if (!isClipActive(mc, t)) continue;
      const asset = assetById.get(mc.assetId);
      if (!asset) continue;
      const speed = mc.speed || 1;
      const sourceTime = mc.sourceIn + (t - mc.start) * speed;
      entries.push({ clip: mc, asset, sourceTime });
    }
  }
  return entries;
}

/**
 * Sequential, decode-ahead frame puller for one video asset, built from the exact ordered list of
 * source timestamps it will be asked for across the whole export. This is what makes fast export
 * actually fast for real video content: repeatedly setting `<video>.currentTime` and waiting for
 * 'seeked' — once per output frame — is slow (each seek can mean a keyframe seek plus decoding
 * forward), whereas decoding a track forward through WebCodecs is bound by decode throughput, not
 * seek latency.
 */
export class AssetFrameSource {
  private generator: AsyncGenerator<WrappedCanvas | null, void, unknown>;
  private input: Input;

  private constructor(input: Input, generator: AsyncGenerator<WrappedCanvas | null, void, unknown>) {
    this.input = input;
    this.generator = generator;
  }

  static async create(asset: MediaAsset, timestamps: number[]): Promise<AssetFrameSource | null> {
    if (timestamps.length === 0) return null;
    try {
      const input = new Input({ source: new UrlSource(asset.url), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;
      const sink = new CanvasSink(track);
      const generator = sink.canvasesAtTimestamps(timestamps);
      return new AssetFrameSource(input, generator);
    } catch (err) {
      console.warn(
        `NyxVideo: fast frame decode unavailable for "${asset.name}", falling back to slower seek-based export for it`,
        err,
      );
      return null;
    }
  }

  async next(): Promise<WrappedCanvas | null> {
    const { value, done } = await this.generator.next();
    return done ? null : (value ?? null);
  }

  dispose() {
    void this.input.dispose();
  }
}

/** Builds one AssetFrameSource per video asset used in the project, from a precomputed pass over every output frame. */
export async function buildAssetFrameSources(
  project: Project,
  frameCount: number,
  frameDuration: number,
  duration: number,
  assetById: Map<string, MediaAsset>,
): Promise<Map<string, AssetFrameSource | null>> {
  const perAssetTimestamps = new Map<string, number[]>();
  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(duration, i * frameDuration);
    for (const entry of getActiveVideoEntries(project, t, assetById)) {
      let arr = perAssetTimestamps.get(entry.asset.id);
      if (!arr) {
        arr = [];
        perAssetTimestamps.set(entry.asset.id, arr);
      }
      arr.push(entry.sourceTime);
    }
  }

  const sources = new Map<string, AssetFrameSource | null>();
  for (const [assetId, timestamps] of perAssetTimestamps) {
    const asset = assetById.get(assetId)!;
    sources.set(assetId, await AssetFrameSource.create(asset, timestamps));
  }
  return sources;
}
