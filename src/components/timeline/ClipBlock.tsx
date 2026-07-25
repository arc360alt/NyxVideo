import { memo, useRef } from 'react';
import type { Clip, MediaAsset } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';
import { beginDragGuard } from '../../lib/dragGuard';
import { computeSnapPoints, snapValue, trySnapClipStart } from '../../lib/snapping';
import { getClipKeyframeTimes } from '../../lib/keyframes';
import { FiFilm, FiImage, FiMusic, FiSquare, FiType } from 'react-icons/fi';
import { WaveformThumb } from './WaveformThumb';

const SNAP_THRESHOLD_PX = 10;

type DragKind = 'move' | 'trim-start' | 'trim-end';

interface Props {
  clip: Clip;
  pxPerSecond: number;
  asset?: MediaAsset;
  trackRowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  tracksMeta: { id: string; kind: 'video' | 'audio'; locked: boolean }[];
}

const KIND_COLORS: Record<Clip['kind'], string> = {
  video: 'bg-sky-900/70 border-sky-600',
  image: 'bg-emerald-900/70 border-emerald-600',
  audio: 'bg-amber-900/70 border-amber-600',
  shape: 'bg-violet-900/70 border-violet-600',
  text: 'bg-pink-900/70 border-pink-600',
};

const KIND_ICON: Record<Clip['kind'], React.ComponentType<{ size?: number; className?: string }>> = {
  video: FiFilm,
  image: FiImage,
  audio: FiMusic,
  shape: FiSquare,
  text: FiType,
};

function ClipBlockImpl({ clip, pxPerSecond, asset, trackRowRefs, tracksMeta }: Props) {
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const selectClip = useProjectStore((s) => s.selectClip);
  const toggleClipInSelection = useProjectStore((s) => s.toggleClipInSelection);
  const moveClip = useProjectStore((s) => s.moveClip);
  const moveSelectedClips = useProjectStore((s) => s.moveSelectedClips);
  const trimClipEdge = useProjectStore((s) => s.trimClipEdge);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const removeAllKeyframesAt = useProjectStore((s) => s.removeAllKeyframesAt);

  const dragRef = useRef<{
    kind: DragKind;
    startClientX: number;
    startClientY: number;
    startClip: Clip;
    groupIds: string[] | null;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selected = selectedClipIds.includes(clip.id);
  const Icon = KIND_ICON[clip.kind];
  const keyframeTimes = getClipKeyframeTimes(clip);

  const startDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (kind === 'move' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      toggleClipInSelection(clip.id);
      return;
    }

    const alreadyInGroup = kind === 'move' && selectedClipIds.length > 1 && selectedClipIds.includes(clip.id);
    if (!alreadyInGroup) selectClip(clip.id);
    const groupIds = alreadyInGroup ? selectedClipIds : null;

    const endGuard = beginDragGuard();
    dragRef.current = { kind, startClientX: e.clientX, startClientY: e.clientY, startClip: clip, groupIds };

    const state = useProjectStore.getState();
    const snapPoints = computeSnapPoints(state.project, state.currentTime, groupIds ?? clip.id);
    const snapThreshold = SNAP_THRESHOLD_PX / pxPerSecond;
    const snapEnabledByDefault = state.snapEnabled;

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      const el = previewRef.current;
      if (!drag || !el) return;
      const dxTime = (ev.clientX - drag.startClientX) / pxPerSecond;
      // Alt temporarily inverts whatever the persisted snap toggle is set to.
      const snapEnabled = ev.altKey ? !snapEnabledByDefault : snapEnabledByDefault;

      if (drag.kind === 'move') {
        let targetTrackId = drag.startClip.trackId;
        if (!drag.groupIds) {
          for (const meta of tracksMeta) {
            if (meta.locked) continue;
            const rowEl = trackRowRefs.current.get(meta.id);
            if (!rowEl) continue;
            const rect = rowEl.getBoundingClientRect();
            if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
              const wantsAudio = drag.startClip.kind === 'audio';
              if ((meta.kind === 'audio') === wantsAudio) targetTrackId = meta.id;
            }
          }
        }
        let newStart = Math.max(0, drag.startClip.start + dxTime);
        if (snapEnabled) newStart = Math.max(0, trySnapClipStart(newStart, drag.startClip.duration, snapPoints, snapThreshold));
        el.style.left = `${newStart * pxPerSecond}px`;
        el.dataset.pendingStart = String(newStart);
        el.dataset.pendingTrack = targetTrackId;
      } else if (drag.kind === 'trim-start') {
        let newStart = Math.max(0, drag.startClip.start + dxTime);
        if (snapEnabled) newStart = snapValue(newStart, snapPoints, snapThreshold);
        el.style.left = `${newStart * pxPerSecond}px`;
        el.style.width = `${Math.max(4, (drag.startClip.start + drag.startClip.duration - newStart) * pxPerSecond)}px`;
        el.dataset.pendingTrim = String(newStart);
      } else {
        let newEnd = Math.max(drag.startClip.start + 0.1, drag.startClip.start + drag.startClip.duration + dxTime);
        if (snapEnabled) newEnd = snapValue(newEnd, snapPoints, snapThreshold);
        el.style.width = `${Math.max(4, (newEnd - drag.startClip.start) * pxPerSecond)}px`;
        el.dataset.pendingTrim = String(newEnd);
      }
    };

    const onUp = () => {
      const drag = dragRef.current;
      const el = previewRef.current;
      if (drag && el) {
        if (drag.kind === 'move') {
          const pendingStart = Number(el.dataset.pendingStart ?? drag.startClip.start);
          if (drag.groupIds) {
            moveSelectedClips(drag.groupIds, pendingStart - drag.startClip.start);
          } else {
            const pendingTrack = el.dataset.pendingTrack ?? drag.startClip.trackId;
            moveClip(clip.id, pendingTrack, pendingStart);
          }
        } else if (drag.kind === 'trim-start') {
          trimClipEdge(clip.id, 'start', Number(el.dataset.pendingTrim ?? drag.startClip.start));
        } else if (drag.kind === 'trim-end') {
          trimClipEdge(clip.id, 'end', Number(el.dataset.pendingTrim ?? drag.startClip.start + drag.startClip.duration));
        }
        delete el.dataset.pendingStart;
        delete el.dataset.pendingTrack;
        delete el.dataset.pendingTrim;
      }
      dragRef.current = null;
      endGuard();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={previewRef}
      onPointerDown={startDrag('move')}
      className={`absolute top-1 flex h-[calc(100%-8px)] select-none flex-col overflow-hidden rounded-md border ${KIND_COLORS[clip.kind]} ${
        selected ? 'ring-2 ring-violet-400' : ''
      }`}
      style={{ left: clip.start * pxPerSecond, width: Math.max(4, clip.duration * pxPerSecond) }}
    >
      <div className="flex items-center gap-1 truncate px-1.5 py-0.5 text-[10px] text-fg/90">
        <Icon size={10} />
        <span className="truncate">{clip.name}</span>
      </div>
      {(clip.kind === 'audio' || clip.kind === 'video') && asset && (
        <div className="min-h-0 flex-1 px-0.5">
          <WaveformThumb
            url={asset.url}
            color={clip.kind === 'audio' ? '#fbbf24' : 'rgba(255,255,255,0.55)'}
            assetDuration={asset.duration}
            sourceIn={clip.sourceIn}
            duration={clip.duration}
            pxPerSecond={pxPerSecond}
          />
        </div>
      )}
      <div
        onPointerDown={startDrag('trim-start')}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize hover:bg-white/20"
      />
      <div
        onPointerDown={startDrag('trim-end')}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-white/20"
      />
      {keyframeTimes.map((t) => (
        <button
          key={t}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            selectClip(clip.id);
            setCurrentTime(clip.start + t);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            removeAllKeyframesAt(clip.id, t);
          }}
          title="Keyframe — click to jump here, right-click to remove"
          className="absolute bottom-0.5 z-10 flex h-2.5 w-2.5 -translate-x-1/2 items-center justify-center"
          style={{ left: t * pxPerSecond }}
        >
          <span className="h-2 w-2 rotate-45 border border-violet-200 bg-violet-400 shadow-sm" />
        </button>
      ))}
    </div>
  );
}

export const ClipBlock = memo(ClipBlockImpl);
