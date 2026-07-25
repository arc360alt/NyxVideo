import type { Clip, Keyframe, KeyframeProp, KeyframeSet, Transform } from '../types';

export const KEYFRAME_PROPS: KeyframeProp[] = ['x', 'y', 'width', 'height', 'rotation', 'opacity'];

function evaluateTrack(track: Keyframe[], t: number): number {
  const sorted = [...track].sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const ratio = b.time === a.time ? 0 : (t - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * ratio;
    }
  }
  return last.value;
}

/** Resolves a clip's effective transform at a time relative to its own start, honoring any keyframes. */
export function resolveTransform(clip: Clip, localTime: number): Transform {
  const kf = clip.keyframes;
  if (!kf) return clip.transform;
  const result: Transform = { ...clip.transform };
  for (const prop of KEYFRAME_PROPS) {
    const track = kf[prop];
    if (track && track.length > 0) {
      result[prop] = evaluateTrack(track, localTime);
    }
  }
  return result;
}

export function withKeyframe(keyframes: KeyframeSet | undefined, prop: KeyframeProp, time: number, value: number): KeyframeSet {
  const existing = keyframes?.[prop] ?? [];
  const filtered = existing.filter((k) => Math.abs(k.time - time) > 0.001);
  const updated = [...filtered, { time, value }].sort((a, b) => a.time - b.time);
  return { ...keyframes, [prop]: updated };
}

export function withoutKeyframe(keyframes: KeyframeSet | undefined, prop: KeyframeProp, time: number): KeyframeSet {
  const existing = keyframes?.[prop] ?? [];
  const updated = existing.filter((k) => Math.abs(k.time - time) > 0.001);
  return { ...keyframes, [prop]: updated };
}

export function clipHasAnyKeyframes(clip: Clip): boolean {
  if (!clip.keyframes) return false;
  return KEYFRAME_PROPS.some((p) => (clip.keyframes?.[p]?.length ?? 0) > 0);
}

export function propHasKeyframes(clip: Clip, prop: KeyframeProp): boolean {
  return (clip.keyframes?.[prop]?.length ?? 0) > 0;
}

export function keyframeAt(clip: Clip, prop: KeyframeProp, time: number): Keyframe | undefined {
  return clip.keyframes?.[prop]?.find((k) => Math.abs(k.time - time) <= 0.001);
}

/** Every distinct time (clip-relative) at which any property has a keyframe, merged across properties. */
export function getClipKeyframeTimes(clip: Clip): number[] {
  if (!clip.keyframes) return [];
  const times = new Set<number>();
  for (const prop of KEYFRAME_PROPS) {
    for (const kf of clip.keyframes[prop] ?? []) times.add(kf.time);
  }
  return Array.from(times).sort((a, b) => a - b);
}
