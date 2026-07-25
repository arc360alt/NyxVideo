import { useEffect, useRef } from 'react';
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
  const dragRef = useRef<DragState | null>(null);
  const dragGuardRef = useRef<(() => void) | null>(null);

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

    if (drag.mode === 'move') {
      setTransformProp(drag.clipId, drag.localTime, 'x', drag.startTransform.x + dx);
      setTransformProp(drag.clipId, drag.localTime, 'y', drag.startTransform.y + dy);
    } else if (drag.mode === 'rotate') {
      const angle = (Math.atan2(pt.y - drag.startTransform.y, pt.x - drag.startTransform.x) * 180) / Math.PI;
      setTransformProp(drag.clipId, drag.localTime, 'rotation', angle + 90);
    } else {
      const local = toLocal(drag.startTransform, pt.x, pt.y);
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface-1/40 p-4">
      <div
        className="relative flex max-h-full max-w-full items-center justify-center"
        style={{ aspectRatio: `${project.width}/${project.height}`, width: '100%' }}
      >
        <canvas
          ref={canvasRef}
          width={project.width}
          height={project.height}
          onPointerDown={handlePointerDown}
          className="h-full max-h-full w-full max-w-full rounded-md border border-border bg-black shadow-2xl"
          style={{ touchAction: 'none' }}
        />
      </div>

      <div className="flex w-full max-w-md items-center justify-center gap-3">
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
