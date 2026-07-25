import type { Project } from '../types';

export function formatTimecode(totalSeconds: number, fps = 30): string {
  const neg = totalSeconds < 0;
  const s = Math.abs(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const frames = Math.floor((s - Math.floor(s)) * fps);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  const out = h > 0
    ? `${pad(h)}:${pad(m)}:${pad(sec)}:${pad(frames)}`
    : `${pad(m)}:${pad(sec)}:${pad(frames)}`;
  return neg ? `-${out}` : out;
}

export function formatShortTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export function projectDuration(project: Project): number {
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.start + clip.duration);
    }
  }
  return max;
}
