import type { Project } from '../types';

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MarqueeLayout {
  headerWidth: number;
  rulerHeight: number;
  rowHeight: number;
  pxPerSecond: number;
}

/** Returns the ids of every clip whose on-screen box (in the timeline content's local coordinate space) intersects `rect`. */
export function collectClipsInRect(project: Project, rect: MarqueeRect, layout: MarqueeLayout): string[] {
  const ids: string[] = [];
  project.tracks.forEach((track, index) => {
    const top = layout.rulerHeight + index * layout.rowHeight;
    const bottom = top + layout.rowHeight;
    if (top >= rect.y2 || bottom <= rect.y1) return;
    for (const clip of track.clips) {
      const left = layout.headerWidth + clip.start * layout.pxPerSecond;
      const right = left + clip.duration * layout.pxPerSecond;
      if (left < rect.x2 && right > rect.x1) ids.push(clip.id);
    }
  });
  return ids;
}
