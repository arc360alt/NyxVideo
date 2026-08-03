import type { MediaAsset, MediaClip, Project, Track } from '../types';
import { computeFadeMultiplier, computeGain, isClipActive } from './clipUtils';

/** Sets preservesPitch across the standardized + legacy vendor-prefixed property names. */
function applyPreservesPitch(el: HTMLMediaElement, preserve: boolean) {
  const anyEl = el as unknown as { preservesPitch?: boolean; mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };
  anyEl.preservesPitch = preserve;
  anyEl.mozPreservesPitch = preserve;
  anyEl.webkitPreservesPitch = preserve;
}

/**
 * Owns pooled media elements (video/audio/image) for every asset in the
 * project, keeps them in sync with the timeline clock during playback or
 * scrubbing, and routes their audio through a shared Web Audio graph so the
 * same graph can be tapped for export recording.
 */
export class CompositionEngine {
  private videoEls = new Map<string, HTMLVideoElement>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private imageEls = new Map<string, HTMLImageElement>();

  private audioCtx: AudioContext | null = null;
  private gains = new WeakMap<HTMLMediaElement, GainNode>();
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private exportDest: MediaStreamAudioDestinationNode | null = null;
  private frameSettledCallbacks = new Set<() => void>();
  private lastFrameCache = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();
  private exportFrameOverrides = new Map<HTMLVideoElement, HTMLCanvasElement | OffscreenCanvas>();

  /** Fires whenever a scrub-triggered seek finishes, so the preview can repaint once the new frame is decoded. */
  onFrameSettled(cb: () => void): () => void {
    this.frameSettledCallbacks.add(cb);
    return () => this.frameSettledCallbacks.delete(cb);
  }

  private notifyFrameSettled() {
    for (const cb of this.frameSettledCallbacks) cb();
  }

  getAudioContext(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
  }

  async resumeAudio() {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  getVideoElement(asset: MediaAsset): HTMLVideoElement {
    let el = this.videoEls.get(asset.id);
    if (!el) {
      el = document.createElement('video');
      el.src = asset.url;
      el.preload = 'auto';
      el.playsInline = true;
      el.crossOrigin = 'anonymous';
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.muted = false;
      el.addEventListener('error', () => {
        console.error(`NyxVideo: video element failed to load "${asset.name}"`, el?.error?.code, el?.error?.message);
      });
      this.videoEls.set(asset.id, el);
    }
    return el;
  }

  getAudioElement(asset: MediaAsset): HTMLAudioElement {
    let el = this.audioEls.get(asset.id);
    if (!el) {
      el = document.createElement('audio');
      el.src = asset.url;
      el.preload = 'auto';
      this.audioEls.set(asset.id, el);
    }
    return el;
  }

  /**
   * Resolves what should currently be drawn for a video element — the export frame override if one
   * is set, else the live decoded frame, else the last successfully decoded frame while a seek/load
   * is in flight. Shared by drawVideoFrame (the normal path) and the chroma-key path in draw.ts, so
   * both agree on "what frame is this clip showing right now" without duplicating the fallback logic.
   */
  resolveVideoSource(el: HTMLVideoElement): { source: CanvasImageSource; width: number; height: number } | null {
    const override = this.exportFrameOverrides.get(el);
    if (override) {
      // Keep the frame-size cache current too, since mediaElementSize() (used for blurred
      // backgrounds) reads from it and the live element's own readyState/videoWidth stay stale
      // for the whole fast export (its content is never actually loaded/seeked in that path).
      let cache = this.lastFrameCache.get(el);
      if (!cache) {
        cache = document.createElement('canvas');
        this.lastFrameCache.set(el, cache);
      }
      if (cache.width !== override.width || cache.height !== override.height) {
        cache.width = override.width;
        cache.height = override.height;
      }
      return { source: override, width: override.width, height: override.height };
    }
    if (el.readyState >= 2 && el.videoWidth > 0) {
      let cache = this.lastFrameCache.get(el);
      if (!cache) {
        cache = document.createElement('canvas');
        this.lastFrameCache.set(el, cache);
      }
      if (cache.width !== el.videoWidth || cache.height !== el.videoHeight) {
        cache.width = el.videoWidth;
        cache.height = el.videoHeight;
      }
      cache.getContext('2d')?.drawImage(el, 0, 0);
      return { source: el, width: el.videoWidth, height: el.videoHeight };
    }
    const cache = this.lastFrameCache.get(el);
    if (cache) return { source: cache, width: cache.width, height: cache.height };
    return null;
  }

  /**
   * Draws the current video frame, falling back to the last successfully decoded
   * frame while a seek/load is in flight. Cut points (especially many short clips
   * back-to-back, as silence removal produces) otherwise flash black for the
   * moment the browser needs to seek the shared <video> element.
   */
  drawVideoFrame(ctx: CanvasRenderingContext2D, el: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number): boolean {
    const resolved = this.resolveVideoSource(el);
    if (!resolved) return false;
    ctx.drawImage(resolved.source, dx, dy, dw, dh);
    return true;
  }

  getCachedFrameSize(el: HTMLVideoElement): [number, number] | null {
    const cache = this.lastFrameCache.get(el);
    return cache ? [cache.width, cache.height] : null;
  }

  getImageElement(asset: MediaAsset): HTMLImageElement {
    let el = this.imageEls.get(asset.id);
    if (!el) {
      el = new Image();
      el.src = asset.url;
      this.imageEls.set(asset.id, el);
    }
    return el;
  }

  /** Lazily builds the Web Audio routing for a media element: element -> gain -> speakers, unless an export capture is in progress (then it's routed to the export destination only, so exporting doesn't also play audibly). */
  private ensureRouting(el: HTMLMediaElement): GainNode {
    let gain = this.gains.get(el);
    if (!gain) {
      const ctx = this.getAudioContext();
      const source = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      source.connect(gain);
      if (this.exportDest) gain.connect(this.exportDest);
      else gain.connect(ctx.destination);
      this.sources.set(el, source);
      this.gains.set(el, gain);
    }
    return gain;
  }

  /** Connects every currently-known gain node to a fresh export destination, muting the local (speaker) monitor for the duration of the capture, and returns it. */
  beginAudioCapture(): MediaStreamAudioDestinationNode {
    const ctx = this.getAudioContext();
    const dest = ctx.createMediaStreamDestination();
    this.exportDest = dest;
    for (const el of [...this.videoEls.values(), ...this.audioEls.values()]) {
      const gain = this.gains.get(el);
      if (gain) {
        try {
          gain.disconnect(ctx.destination);
        } catch {
          /* already disconnected */
        }
        gain.connect(dest);
      }
    }
    return dest;
  }

  /** Disconnects every gain node from the export destination and reconnects them to speakers. */
  endAudioCapture() {
    if (!this.exportDest) return;
    const ctx = this.getAudioContext();
    for (const el of [...this.videoEls.values(), ...this.audioEls.values()]) {
      const gain = this.gains.get(el);
      if (gain) {
        try {
          gain.disconnect(this.exportDest);
        } catch {
          /* already disconnected */
        }
        gain.connect(ctx.destination);
      }
    }
    this.exportDest = null;
  }

  /** Plays/pauses/seeks pooled elements so they reflect timeline time `t`. */
  syncFrame(project: Project, t: number, playing: boolean) {
    const assetById = new Map<string, MediaAsset>(project.assets.map((a) => [a.id, a]));

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.kind !== 'video' && clip.kind !== 'audio') continue;
        const mc = clip as MediaClip;
        if (!isClipActive(mc, t)) continue;
        const asset = assetById.get(mc.assetId);
        if (!asset) continue;

        const el = mc.kind === 'video' ? this.getVideoElement(asset) : this.getAudioElement(asset);
        const gain = this.ensureRouting(el);
        gain.gain.value = computeGain(mc, track) * computeFadeMultiplier(mc, t - mc.start);

        const speed = mc.speed || 1;
        try {
          if (el.playbackRate !== speed) el.playbackRate = speed;
          applyPreservesPitch(el, mc.preservePitch ?? true);
        } catch {
          // Some browsers throw if playbackRate falls outside their supported range; skip the
          // rate change for this frame rather than let it crash the whole sync/playback loop.
        }

        const desired = mc.sourceIn + (t - mc.start) * speed;
        if (playing) {
          if (el.paused) {
            if (Number.isFinite(el.duration) && Math.abs(el.currentTime - desired) > 0.15) el.currentTime = desired;
            el.play().catch(() => {});
          } else if (Math.abs(el.currentTime - desired) > 0.35) {
            el.currentTime = desired;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - desired) > 0.03) {
            if (mc.kind === 'video') {
              el.addEventListener('seeked', () => this.notifyFrameSettled(), { once: true });
            }
            el.currentTime = desired;
          }
        }
      }
    }

    const activeAssetIds = new Set<string>();
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if ((clip.kind === 'video' || clip.kind === 'audio') && isClipActive(clip, t)) {
          activeAssetIds.add((clip as MediaClip).assetId);
        }
      }
    }
    for (const [assetId, el] of this.videoEls) {
      if (!activeAssetIds.has(assetId) && !el.paused) el.pause();
    }
    for (const [assetId, el] of this.audioEls) {
      if (!activeAssetIds.has(assetId) && !el.paused) el.pause();
    }
  }

/**
   * Seeks a single video element to its exact source time and waits for the seek to actually land.
   * Fallback path for fast export: used only for assets where the fast, sequential-decode frame
   * source (see lib/exportFrames.ts) couldn't be set up — per-frame seeking a live <video> element is
   * far slower (each seek can require a keyframe seek + forward-decode), so it's a last resort, not
   * the default.
   */
  async seekVideoAssetExact(asset: MediaAsset, sourceTime: number): Promise<void> {
    const el = this.getVideoElement(asset);
    await this.seekVideoElementExact(el, sourceTime);
  }

  /**
   * Registers a pre-decoded frame to draw instead of a pooled video element's live content, for the
   * duration of one export frame. Used by the fast export pipeline, which decodes frames sequentially
   * via mediabunny rather than scrubbing the live element — drawVideoFrame transparently prefers this
   * override when present, so draw.ts needs no changes to benefit from it.
   */
  setExportFrameOverride(el: HTMLVideoElement, canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.exportFrameOverrides.set(el, canvas);
  }

  clearExportFrameOverrides() {
    this.exportFrameOverrides.clear();
  }

  private seekVideoElementExact(el: HTMLVideoElement, time: number): Promise<void> {
    const clamped = Number.isFinite(el.duration) ? Math.max(0, Math.min(time, el.duration - 0.001)) : Math.max(0, time);
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - clamped) < 0.001 && el.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      const onSeeked = () => {
        el.removeEventListener('seeked', onSeeked);
        el.removeEventListener('error', onSeeked);
        resolve();
      };
      el.addEventListener('seeked', onSeeked, { once: true });
      el.addEventListener('error', onSeeked, { once: true });
      el.currentTime = clamped;
    });
  }

  pauseAll() {
    for (const el of this.videoEls.values()) el.pause();
    for (const el of this.audioEls.values()) el.pause();
  }

  /** Pre-creates elements for every asset so metadata (dimensions/readiness) warms up. */
  async warm(project: Project) {
    for (const asset of project.assets) {
      if (asset.kind === 'video') this.getVideoElement(asset);
      if (asset.kind === 'audio') this.getAudioElement(asset);
      if (asset.kind === 'image') this.getImageElement(asset);
    }
  }

  dispose() {
    this.pauseAll();
    this.videoEls.clear();
    this.audioEls.clear();
    this.imageEls.clear();
  }
}

let singleton: CompositionEngine | null = null;
export function getEngine(): CompositionEngine {
  if (!singleton) singleton = new CompositionEngine();
  return singleton;
}

export function trackOfClip(project: Project, clipId: string): Track | undefined {
  return project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
}
