import { useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';

interface Props {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  pxPerSecond: number;
  headerWidth: number;
}

/**
 * Renders nothing — its only job is subscribing to currentTime (and zoom) and
 * keeping the playhead centered in the visible timeline area while auto-scroll
 * is enabled, isolated from the rest of Timeline so this doesn't force the
 * whole track/clip tree to re-render every frame during playback. Zoom is a
 * dependency here on purpose: without it, zooming while the playhead is out of
 * view leaves the scroll position wherever it happened to land (the browser
 * just preserves scrollLeft in pixels), which looks like it "zoomed into a
 * random spot" — recentering on zoom fixes that.
 */
export function AutoScrollController({ scrollContainerRef, pxPerSecond, headerWidth }: Props) {
  const currentTime = useProjectStore((s) => s.currentTime);
  const autoScrollEnabled = useProjectStore((s) => s.autoScrollEnabled);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const playheadX = headerWidth + currentTime * pxPerSecond;
    const target = playheadX - (container.clientWidth + headerWidth) / 2;
    container.scrollLeft = Math.max(0, target);
  }, [currentTime, pxPerSecond, autoScrollEnabled, headerWidth, scrollContainerRef]);

  return null;
}
