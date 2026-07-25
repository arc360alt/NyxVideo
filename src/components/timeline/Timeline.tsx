import { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { projectDuration } from '../../lib/time';
import { collectClipsInRect, type MarqueeRect } from '../../lib/marqueeSelect';
import { beginDragGuard } from '../../lib/dragGuard';
import { Ruler } from './Ruler';
import { TrackRow } from './TrackRow';
import { Playhead } from './Playhead';
import { AutoScrollController } from './AutoScrollController';
import { TimelineToolbar } from './TimelineToolbar';
import { ResizeHandle } from '../ResizeHandle';
import { FiMinus, FiPlus, FiVideo } from 'react-icons/fi';
import { MdLibraryMusic } from 'react-icons/md';

const HEADER_WIDTH = 148;
const ROW_HEIGHT = 56;
const RULER_HEIGHT = 28;
const MARQUEE_MOVE_THRESHOLD = 3;

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const setZoom = useProjectStore((s) => s.setZoom);
  const zoomToScrubberEnabled = useProjectStore((s) => s.zoomToScrubberEnabled);
  const addTrack = useProjectStore((s) => s.addTrack);
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectClips = useProjectStore((s) => s.selectClips);
  const timelineHeight = useLayoutStore((s) => s.timelineHeight);
  const setTimelineHeight = useLayoutStore((s) => s.setTimelineHeight);

  const trackRowRefs = useRef(new Map<string, HTMLDivElement>());
  const registerRefCache = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const duration = projectDuration(project);
  const totalWidth = Math.max(60, (duration + 20) * pxPerSecond);
  const tracksMeta = useMemo(
    () => project.tracks.map((t) => ({ id: t.id, kind: t.kind, locked: t.locked })),
    [project.tracks],
  );

  const handleContentPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const content = contentRef.current;
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    let moved = false;
    const endGuard = beginDragGuard();

    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (!moved && (Math.abs(x - startX) > MARQUEE_MOVE_THRESHOLD || Math.abs(y - startY) > MARQUEE_MOVE_THRESHOLD)) {
        moved = true;
      }
      if (moved) setMarquee({ x1: Math.min(startX, x), y1: Math.min(startY, y), x2: Math.max(startX, x), y2: Math.max(startY, y) });
    };
    const onUp = (ev: PointerEvent) => {
      endGuard();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const finalRect: MarqueeRect = { x1: Math.min(startX, x), y1: Math.min(startY, y), x2: Math.max(startX, x), y2: Math.max(startY, y) };
        const ids = collectClipsInRect(project, finalRect, { headerWidth: HEADER_WIDTH, rulerHeight: RULER_HEIGHT, rowHeight: ROW_HEIGHT, pxPerSecond });
        selectClips(ids);
      } else {
        selectClip(null);
      }
      setMarquee(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Bumped on every zoom action and checked before the rAF-deferred scroll adjustment below applies,
  // so a burst of rapid zoom calls (e.g. dragging the zoom slider) can't have an earlier call's
  // stale, queued adjustment stomp on a later one's — only the most recent call's ever lands.
  const zoomTokenRef = useRef(0);

  // Reads currentTime imperatively (not as a subscription) so zooming doesn't add Timeline to the
  // set of components re-rendering every animation frame during playback — only the zoom action
  // itself needs the playhead's position, once, at the moment it happens.
  const handleZoom = (nextPxPerSecond: number) => {
    const clamped = Math.min(400, Math.max(2, nextPxPerSecond));
    if (clamped === pxPerSecond) return;
    setZoom(clamped);

    const container = scrollContainerRef.current;
    if (!zoomToScrubberEnabled || !container) return;

    // Always re-centers the playhead in the viewport after zooming, rather than trying to keep it
    // pinned at whatever screen position it previously happened to occupy — simpler, and matches
    // what auto-scroll already does, so the two behave consistently when both are on.
    const token = ++zoomTokenRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (zoomTokenRef.current !== token) return;
        const t = useProjectStore.getState().currentTime;
        const playheadX = HEADER_WIDTH + t * clamped;
        const target = playheadX - (container.clientWidth + HEADER_WIDTH) / 2;
        container.scrollLeft = Math.max(0, target);
      });
    });
  };

  const getRegisterRef = useCallback((trackId: string) => {
    let fn = registerRefCache.current.get(trackId);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        if (el) trackRowRefs.current.set(trackId, el);
        else trackRowRefs.current.delete(trackId);
      };
      registerRefCache.current.set(trackId, fn);
    }
    return fn;
  }, []);

  return (
    <div className="flex shrink-0 flex-col border-t border-border bg-surface-0" style={{ height: timelineHeight }}>
      <ResizeHandle axis="y" invert size={timelineHeight} onResize={setTimelineHeight} min={140} max={640} />
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <TimelineToolbar />
        <button
          onClick={() => addTrack('video')}
          className="flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2"
        >
          <FiVideo size={12} /> Video Track
        </button>
        <button
          onClick={() => addTrack('audio')}
          className="flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2"
        >
          <MdLibraryMusic size={12} /> Audio Track
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-fg-faint">
          <button onClick={() => handleZoom(pxPerSecond - 20)} className="hover:text-fg">
            <FiMinus size={12} />
          </button>
          <input
            type="range"
            min={2}
            max={400}
            value={pxPerSecond}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-24"
          />
          <button onClick={() => handleZoom(pxPerSecond + 20)} className="hover:text-fg">
            <FiPlus size={12} />
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="nyx-scroll relative flex-1 overflow-auto">
        <div ref={contentRef} className="relative" style={{ width: HEADER_WIDTH + totalWidth }} onPointerDown={handleContentPointerDown}>
          <Ruler totalWidth={totalWidth} headerWidth={HEADER_WIDTH} />
          {project.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              pxPerSecond={pxPerSecond}
              totalWidth={totalWidth}
              headerWidth={HEADER_WIDTH}
              rowHeight={ROW_HEIGHT}
              trackRowRefs={trackRowRefs}
              tracksMeta={tracksMeta}
              registerRef={getRegisterRef(track.id)}
            />
          ))}
          <Playhead pxPerSecond={pxPerSecond} headerWidth={HEADER_WIDTH} />
          {marquee && (
            <div
              className="pointer-events-none absolute z-30 border border-violet-400 bg-violet-400/15"
              style={{ left: marquee.x1, top: marquee.y1, width: marquee.x2 - marquee.x1, height: marquee.y2 - marquee.y1 }}
            />
          )}
        </div>
      </div>
      <AutoScrollController scrollContainerRef={scrollContainerRef} pxPerSecond={pxPerSecond} headerWidth={HEADER_WIDTH} />
    </div>
  );
}
