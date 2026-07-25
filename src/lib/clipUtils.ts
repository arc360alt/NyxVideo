import type { Clip, MediaClip, Track } from '../types';

export function isClipActive(clip: Clip, t: number): boolean {
  return t >= clip.start && t < clip.start + clip.duration;
}

export function computeGain(clip: MediaClip, track: Track): number {
  if (track.muted || clip.muted) return 0;
  return Math.max(0, Math.min(2, clip.volume / 100));
}

/**
 * Multiplier (0-1) from a clip's fadeIn/fadeOut at a given clip-relative time — the shared math
 * behind both the visual opacity fade (draw.ts) and the audio gain fade (engine.ts, audioMixdown.ts),
 * so "fade to black" and "fade to silent" always move together at the same rate.
 */
export function computeFadeMultiplier(clip: Clip, localTime: number): number {
  let m = 1;
  const fadeIn = clip.fadeIn ?? 0;
  if (fadeIn > 0 && localTime < fadeIn) m *= Math.max(0, localTime / fadeIn);
  const fadeOut = clip.fadeOut ?? 0;
  const timeFromEnd = clip.duration - localTime;
  if (fadeOut > 0 && timeFromEnd < fadeOut) m *= Math.max(0, timeFromEnd / fadeOut);
  return Math.max(0, Math.min(1, m));
}
