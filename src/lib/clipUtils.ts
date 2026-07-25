import type { Clip, MediaClip, Track } from '../types';

export function isClipActive(clip: Clip, t: number): boolean {
  return t >= clip.start && t < clip.start + clip.duration;
}

export function computeGain(clip: MediaClip, track: Track): number {
  if (track.muted || clip.muted) return 0;
  return Math.max(0, Math.min(2, clip.volume / 100));
}
