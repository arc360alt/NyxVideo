import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { getEngine } from '../lib/engine';
import { drawFrame, HANDLE_SIZE } from '../lib/draw';
import { formatTimecode, projectDuration } from '../lib/time';
import { isClipActive } from '../lib/clipUtils';
import { resolveTransform } from '../lib/keyframes';
import { beginDragGuard } from '../lib/dragGuard';
import type { Clip, Transform } from '../types';
import { FiPause, FiPlay, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import { MdSkipNext, MdSkipPrevious } from 'react-icons/md';

type DragMode = 'move' | 'rotate' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';

interface DragState {
  mode: DragMode;
  clipId: string;
  clipStart: number;
  localTime: number;
  startTransform: Transform;
  startPointer: { x: number; y: number };
}

// How close (in native canvas pixels) a dragged edge/center/point needs to be to a snap target
// before it magnetically snaps to it. Kept in canvas-pixel space (not screen pixels) since
// toCanvasPoint already converts pointer coordinates into that space.
const PREVIEW_SNAP_THRESHOLD = 14;

type GuideType = 'center' | 'edge-low' | 'edge-high';

/** Picks the closest candidate within range, if any — a single reusable snap primitive for both axes. */
function pickSnap(value: number, candidates: { value: number; guide: GuideType }[], threshold: number): { value: number; guide: GuideType | null } {
  let best = { value, guide: null as GuideType | null };
  let bestDist = threshold;
  for (const c of candidates) {
    const dist = Math.abs(value - c.value);
    if (dist <= bestDist) {
      bestDist = dist;
      best = { value: c.value, guide: c.guide };
    }
  }
  return best;
}

/** Snaps a clip's center position on one axis to the canvas's own center or edges, given the clip's half-size on that axis. */
function snapCenterAxis(center: number, halfSize: number, canvasSize: number, threshold: number) {
  return pickSnap(
    center,
    [
      { value: canvasSize / 2, guide: 'center' },
      { value: halfSize, guide: 'edge-low' },
      { value: canvasSize - halfSize, guide: 'edge-high' },
    ],
    threshold,
  );
}

/** Snaps a raw point on one axis to the canvas's own center or edges — used while resizing, where the dragged corner IS the point that should feel magnetic. */
function snapPointAxis(value: number, canvasSize: number, threshold: number) {
  return pickSnap(
    value,
    [
      { value: 0, guide: 'edge-low' },
      { value: canvasSize / 2, guide: 'center' },
      { value: canvasSize, guide: 'edge-high' },
    ],
    threshold,
  );
}

function toCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function toLocal(t: Transform, px: number, py: number) {
  const dx = px - t.x;
  const dy = py - t.y;
  const rad = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function hitRect(t: Transform, px: number, py: number): boolean {
  const local = toLocal(t, px, py);
  return Math.abs(local.x) <= t.width / 2 && Math.abs(local.y) <= t.height / 2;
}

function hitHandle(t: Transform, px: number, py: number): DragMode | null {
  const local = toLocal(t, px, py);
  const half = HANDLE_SIZE;
  const corners: [DragMode, number, number][] = [
    ['resize-tl', -t.width / 2, -t.height / 2],
    ['resize-tr', t.width / 2, -t.height / 2],
    ['resize-bl', -t.width / 2, t.height / 2],
    ['resize-br', t.width / 2, t.height / 2],
  ];
  for (const [mode, cx, cy] of corners) {
    if (Math.abs(local.x - cx) <= half && Math.abs(local.y - cy) <= half) return mode;
  }
  const rotY = -t.height / 2 - 28;
  if (Math.hypot(local.x - 0, local.y - rotY) <= half) return 'rotate';
  return null;
}

export function PreviewStage() {
  const project = useProjectStore((s) => s.project);
  const projectId = useProjectStore((s) => s.projectId);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);
  const setTransformProp = useProjectStore((s) => s.setTransformProp);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const togglePlay = useProjectStore((s) => s.togglePlay);
  const setPlaying = useProjectStore((s) => s.setPlaying);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragGuardRef = useRef<(() => void) | null>(null);
  const guideVRef = useRef<HTMLDivElement>(null);
  const guideHRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // CSS aspect-ratio + width:100% + max-height doesn't reliably renegotiate width once max-height
  // clamps the box in a flex layout (width was already a definite 100%, so browsers don't always
  // shrink it back down to match) — that's what was stretching the preview at larger viewport sizes.
  // Measuring the available box in JS and computing an explicit pixel size (classic "contain" fit)
  // sidesteps that entirely: the canvas's CSS size is always exactly the project's aspect ratio.
  useEffect(() => {
    const container = measureRef.current;
    if (!container) return;
    const targetAspect = project.width / project.height || 1;

    const recompute = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const containerAspect = cw / ch;
      const [w, h] = containerAspect > targetAspect ? [ch * targetAspect, ch] : [cw, cw / targetAspect];
      setDisplaySize({ width: Math.floor(w), height: Math.floor(h) });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  const setGuide = (axis: 'v' | 'h', posRatio: number | null) => {
    const el = axis === 'v' ? guideVRef.current : guideHRef.current;
    if (!el) return;
    if (posRatio === null) {
      el.style.opacity = '0';
    } else {
      el.style.opacity = '1';
      if (axis === 'v') el.style.left = `${posRatio * 100}%`;
      else el.style.top = `${posRatio * 100}%`;
    }
  };

  const engine = getEngine();
  const duration = projectDuration(project);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, engine, project, currentTime, { selectedClipId });
  });

  useEffect(() => {
    void engine.warm(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.assets.length, projectId]);

  useEffect(() => {
    return engine.onFrameSettled(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const state = useProjectStore.getState();
      drawFrame(ctx, engine, state.project, state.currentTime, { selectedClipId: state.selectedClipId });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const pt = toCanvasPoint(canvas, e.clientX, e.clientY);

    const selected = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
    if (selected && 'transform' in selected) {
      const t = resolveTransform(selected, currentTime - selected.start);
      const handle = hitHandle(t, pt.x, pt.y);
      if (handle) {
        dragRef.current = {
          mode: handle,
          clipId: selected.id,
          clipStart: selected.start,
          localTime: currentTime - selected.start,
          startTransform: t,
          startPointer: pt,
        };
        dragGuardRef.current = beginDragGuard();
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return;
      }
    }

    let hit: Clip | null = null;
    for (const track of project.tracks) {
      if (track.kind !== 'video' || track.hidden) continue;
      const activeHit = track.clips.find(
        (clip) => isClipActive(clip, currentTime) && hitRect(resolveTransform(clip, currentTime - clip.start), pt.x, pt.y),
      );
      if (activeHit) {
        hit = activeHit;
        break;
      }
    }

    if (hit) {
      selectClip(hit.id);
      const t = resolveTransform(hit, currentTime - hit.start);
      dragRef.current = {
        mode: 'move',
        clipId: hit.id,
        clipStart: hit.start,
        localTime: currentTime - hit.start,
        startTransform: t,
        startPointer: pt,
      };
      dragGuardRef.current = beginDragGuard();
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    } else {
      selectClip(null);
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const pt = toCanvasPoint(canvas, e.clientX, e.clientY);
    const dx = pt.x - drag.startPointer.x;
    const dy = pt.y - drag.startPointer.y;
    // Hold Alt to temporarily turn snapping off, matching the same convention the timeline uses.
    const snapEnabled = !e.altKey;

    if (drag.mode === 'move') {
      let newX = drag.startTransform.x + dx;
      let newY = drag.startTransform.y + dy;
      if (snapEnabled) {
        const snapX = snapCenterAxis(newX, drag.startTransform.width / 2, project.width, PREVIEW_SNAP_THRESHOLD);
        const snapY = snapCenterAxis(newY, drag.startTransform.height / 2, project.height, PREVIEW_SNAP_THRESHOLD);
        newX = snapX.value;
        newY = snapY.value;
        setGuide('v', snapX.guide ? newX / project.width : null);
        setGuide('h', snapY.guide ? newY / project.height : null);
      } else {
        setGuide('v', null);
        setGuide('h', null);
      }
      setTransformProp(drag.clipId, drag.localTime, 'x', newX);
      setTransformProp(drag.clipId, drag.localTime, 'y', newY);
    } else if (drag.mode === 'rotate') {
      const angle = (Math.atan2(pt.y - drag.startTransform.y, pt.x - drag.startTransform.x) * 180) / Math.PI;
      setTransformProp(drag.clipId, drag.localTime, 'rotation', angle + 90);
    } else {
      let px = pt.x;
      let py = pt.y;
      if (snapEnabled) {
        // Snap the dragged corner itself to the canvas's own edges/center — the corner is what
        // should feel magnetic while resizing, not the clip's (still-moving) center or edges.
        const snapPx = snapPointAxis(px, project.width, PREVIEW_SNAP_THRESHOLD);
        const snapPy = snapPointAxis(py, project.height, PREVIEW_SNAP_THRESHOLD);
        px = snapPx.value;
        py = snapPy.value;
        setGuide('v', snapPx.guide ? px / project.width : null);
        setGuide('h', snapPy.guide ? py / project.height : null);
      } else {
        setGuide('v', null);
        setGuide('h', null);
      }
      const local = toLocal(drag.startTransform, px, py);
      let w = Math.max(20, Math.abs(local.x) * 2);
      let h = Math.max(20, Math.abs(local.y) * 2);
      if (e.shiftKey) {
        const scale = Math.max(w / drag.startTransform.width, h / drag.startTransform.height);
        w = drag.startTransform.width * scale;
        h = drag.startTransform.height * scale;
      }
      setTransformProp(drag.clipId, drag.localTime, 'width', w);
      setTransformProp(drag.clipId, drag.localTime, 'height', h);
    }
  };

  const handlePointerUp = () => {
    setGuide('v', null);
    setGuide('h', null);
    dragRef.current = null;
    dragGuardRef.current?.();
    dragGuardRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const handlePlay = async () => {
    await engine.resumeAudio();
    if (!isPlaying && currentTime >= duration && duration > 0) setCurrentTime(0);
    togglePlay();
  };

  const step = 1 / project.fps;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 bg-surface-1/40 p-4">
      <div ref={measureRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="relative" style={{ width: displaySize.width, height: displaySize.height }}>
          <canvas
            ref={canvasRef}
            width={project.width}
            height={project.height}
            onPointerDown={handlePointerDown}
            className="h-full w-full rounded-md border border-border bg-black shadow-2xl"
            style={{ touchAction: 'none' }}
          />
          {/* Snap guides — positioned as a percentage of the canvas box so they track it exactly
              regardless of how the canvas's native resolution maps to its displayed CSS size. */}
          <div ref={guideVRef} className="pointer-events-none absolute inset-y-0 w-px bg-violet-400 opacity-0" style={{ left: '50%' }} />
          <div ref={guideHRef} className="pointer-events-none absolute inset-x-0 h-px bg-violet-400 opacity-0" style={{ top: '50%' }} />
        </div>
      </div>

      <div className="flex w-full max-w-md shrink-0 items-center justify-center gap-3">
        <button
          className="rounded p-2 text-fg-muted hover:bg-surface-2"
          onClick={() => setCurrentTime(0)}
          title="Skip to start"
        >
          <FiSkipBack size={16} />
        </button>
        <button
          className="rounded p-2 text-fg-muted hover:bg-surface-2"
          onClick={() => setCurrentTime(Math.max(0, currentTime - step))}
          title="Previous frame"
        >
          <MdSkipPrevious size={18} />
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500"
          onClick={handlePlay}
        >
          {isPlaying ? <FiPause size={16} /> : <FiPlay size={16} className="ml-0.5" />}
        </button>
        <button
          className="rounded p-2 text-fg-muted hover:bg-surface-2"
          onClick={() => setCurrentTime(Math.min(duration, currentTime + step))}
          title="Next frame"
        >
          <MdSkipNext size={18} />
        </button>
        <button
          className="rounded p-2 text-fg-muted hover:bg-surface-2"
          onClick={() => {
            setCurrentTime(duration);
            setPlaying(false);
          }}
          title="Skip to end"
        >
          <FiSkipForward size={16} />
        </button>
        <span className="ml-2 font-mono text-xs text-fg-subtle">
          {formatTimecode(currentTime, project.fps)} / {formatTimecode(duration, project.fps)}
        </span>
      </div>
    </div>
  );
}
