import type { Project } from '../types';

/** Every timeline position worth snapping to: other clips' edges, markers, the playhead, and zero. */
export function computeSnapPoints(project: Project, currentTime: number, excludeClipIds?: string | string[]): number[] {
  const excluded = new Set(Array.isArray(excludeClipIds) ? excludeClipIds : excludeClipIds ? [excludeClipIds] : []);
  const points = new Set<number>([0, currentTime]);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (excluded.has(clip.id)) continue;
      points.add(clip.start);
      points.add(clip.start + clip.duration);
    }
  }
  for (const marker of project.markers) points.add(marker.time);
  return Array.from(points).sort((a, b) => a - b);
}

/** Nearest point within `thresholdSeconds`, or `null` if nothing is close enough — never inferred from float equality. */
export function findSnap(value: number, points: number[], thresholdSeconds: number): number | null {
  let best: number | null = null;
  let bestDist = thresholdSeconds;
  for (const p of points) {
    const dist = Math.abs(p - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Snaps `value` to the nearest point within `thresholdSeconds`, otherwise returns it unchanged. */
export function snapValue(value: number, points: number[], thresholdSeconds: number): number {
  return findSnap(value, points, thresholdSeconds) ?? value;
}

/**
 * Snaps a moving clip's start by checking both its leading and trailing edge
 * against snap points, preferring whichever edge is actually closer to a
 * point. Uses explicit null checks (not float equality) to tell "found a
 * snap" apart from "no snap found" — a `end + duration - duration` round
 * trip is not guaranteed to equal the original float, so comparing against
 * the original value directly was silently picking the wrong edge almost
 * every time.
 */
export function trySnapClipStart(rawStart: number, duration: number, points: number[], thresholdSeconds: number): number {
  const startSnap = findSnap(rawStart, points, thresholdSeconds);
  const endSnap = findSnap(rawStart + duration, points, thresholdSeconds);
  const endCandidate = endSnap !== null ? endSnap - duration : null;

  if (startSnap !== null && endCandidate !== null) {
    return Math.abs(startSnap - rawStart) <= Math.abs(endCandidate - rawStart) ? startSnap : endCandidate;
  }
  if (startSnap !== null) return startSnap;
  if (endCandidate !== null) return endCandidate;
  return rawStart;
}
