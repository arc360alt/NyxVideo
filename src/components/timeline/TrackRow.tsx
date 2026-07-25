import { memo, useMemo } from 'react';
import type { Clip, Track } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';
import { ClipBlock } from './ClipBlock';
import { FiEye, FiEyeOff, FiLock, FiUnlock, FiTrash2, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { FaCircleHalfStroke, FaPlus } from 'react-icons/fa6';

// Half the seam button's rendered width (w-6 = 24px), used to clamp its centered position so it
// can't render partially outside the track content area (see the seam button's style below).
const SEAM_BTN_HALF = 12;

interface Seam {
  key: string;
  x: number;
  fromClip: Clip;
  toClip: Clip;
  transitionId?: string;
}

function computeSeams(track: Track, transitions: { id: string; fromClipId: string; toClipId: string }[], pxPerSecond: number): Seam[] {
  if (track.kind !== 'video') return [];
  const sorted = [...track.clips].sort((a, b) => a.start - b.start);
  const seams: Seam[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const existing = transitions.find((tr) => tr.fromClipId === a.id && tr.toClipId === b.id);
    const gap = b.start - (a.start + a.duration);
    if (existing) {
      seams.push({ key: existing.id, x: b.start * pxPerSecond, fromClip: a, toClip: b, transitionId: existing.id });
    } else if (Math.abs(gap) < 0.05) {
      seams.push({ key: `${a.id}-${b.id}`, x: b.start * pxPerSecond, fromClip: a, toClip: b });
    }
  }
  return seams;
}

interface Props {
  track: Track;
  pxPerSecond: number;
  totalWidth: number;
  headerWidth: number;
  rowHeight: number;
  registerRef: (el: HTMLDivElement | null) => void;
  trackRowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  tracksMeta: { id: string; kind: 'video' | 'audio'; locked: boolean }[];
}

function TrackRowImpl({ track, pxPerSecond, totalWidth, headerWidth, rowHeight, registerRef, trackRowRefs, tracksMeta }: Props) {
  const assets = useProjectStore((s) => s.project.assets);
  const transitions = useProjectStore((s) => s.project.transitions);
  const addMediaToTimeline = useProjectStore((s) => s.addMediaToTimeline);
  const addShapeToTimeline = useProjectStore((s) => s.addShapeToTimeline);
  const addTextToTimeline = useProjectStore((s) => s.addTextToTimeline);
  const addSoundEffectToTimeline = useProjectStore((s) => s.addSoundEffectToTimeline);
  const selectTransition = useProjectStore((s) => s.selectTransition);
  const applyTransition = useProjectStore((s) => s.applyTransition);
  const selectedTransitionId = useProjectStore((s) => s.selectedTransitionId);
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute);
  const toggleTrackLock = useProjectStore((s) => s.toggleTrackLock);
  const toggleTrackHidden = useProjectStore((s) => s.toggleTrackHidden);
  const removeTrack = useProjectStore((s) => s.removeTrack);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const seams = useMemo(() => computeSeams(track, transitions, pxPerSecond), [track, transitions, pxPerSecond]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (track.locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = Math.max(0, (e.clientX - rect.left) / pxPerSecond);

    const assetId = e.dataTransfer.getData('application/x-nyx-asset');
    const shapeType = e.dataTransfer.getData('application/x-nyx-shape');
    const isText = e.dataTransfer.getData('application/x-nyx-text');
    const sfxId = e.dataTransfer.getData('application/x-nyx-sfx');

    if (assetId) addMediaToTimeline(assetId, { trackId: track.id, start });
    else if (shapeType && track.kind === 'video') addShapeToTimeline(shapeType as never, { trackId: track.id, start });
    else if (isText && track.kind === 'video') addTextToTimeline({ trackId: track.id, start });
    else if (sfxId && track.kind === 'audio') void addSoundEffectToTimeline(sfxId, { trackId: track.id, start });
  };

  return (
    <div className="flex border-b border-border" style={{ height: rowHeight }}>
      <div
        // z-30 matches the Ruler's own sticky header cell, and must stay above anything that can
        // scroll underneath it (seam buttons and the playhead are both z-20) — otherwise, whatever
        // timeline content happens to be scrolled to sit right under this pinned column shows
        // through on top of it instead of being cleanly covered, like it was overlapping the track
        // controls.
        className="sticky left-0 z-30 flex shrink-0 flex-col justify-center gap-1 border-r border-border bg-surface-0 px-2"
        style={{ width: headerWidth }}
      >
        <div className="truncate text-xs text-fg-muted">{track.name}</div>
        <div className="flex gap-1 text-fg-faint">
          <button onClick={() => toggleTrackMute(track.id)} className="hover:text-fg" title="Mute track">
            {track.muted ? <FiVolumeX size={12} /> : <FiVolume2 size={12} />}
          </button>
          <button onClick={() => toggleTrackLock(track.id)} className="hover:text-fg" title="Lock track">
            {track.locked ? <FiLock size={12} /> : <FiUnlock size={12} />}
          </button>
          {track.kind === 'video' && (
            <button onClick={() => toggleTrackHidden(track.id)} className="hover:text-fg" title="Hide track">
              {track.hidden ? <FiEyeOff size={12} /> : <FiEye size={12} />}
            </button>
          )}
          <button onClick={() => removeTrack(track.id)} className="ml-auto hover:text-red-400" title="Delete track">
            <FiTrash2 size={12} />
          </button>
        </div>
      </div>
      <div
        ref={registerRef}
        className={`relative shrink-0 ${track.kind === 'audio' ? 'bg-surface-0/60' : 'bg-surface-1/40'} ${track.locked ? 'opacity-50' : ''}`}
        style={{ width: totalWidth }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {track.clips.map((clip) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            pxPerSecond={pxPerSecond}
            asset={'assetId' in clip ? assetById.get(clip.assetId) : undefined}
            trackRowRefs={trackRowRefs}
            tracksMeta={tracksMeta}
          />
        ))}

        {seams.map((seam) => (
          <button
            key={seam.key}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (seam.transitionId) selectTransition(seam.transitionId);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const type = e.dataTransfer.getData('application/x-nyx-transition');
              const duration = Number(e.dataTransfer.getData('application/x-nyx-transition-duration')) || 1;
              if (type) applyTransition(track.id, seam.fromClip.id, seam.toClip.id, type as never, duration);
            }}
            title={seam.transitionId ? 'Transition — click to edit' : 'Drop a transition here'}
            className={`absolute top-1/2 z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition ${
              seam.transitionId
                ? `border-fuchsia-400 bg-fuchsia-600 text-white ${selectedTransitionId === seam.transitionId ? 'ring-2 ring-fuchsia-300' : ''}`
                : 'border-border-strong bg-surface-2 text-fg-faint opacity-60 hover:opacity-100'
            }`}
            // Clamp so a seam right at (or near) the start of the timeline doesn't render the
            // centered button half off the left edge of the track content, spilling into the
            // sticky track-header column next to it.
            style={{ left: Math.min(totalWidth - SEAM_BTN_HALF, Math.max(SEAM_BTN_HALF, seam.x)) }}
          >
            {seam.transitionId ? <FaCircleHalfStroke size={11} /> : <FaPlus size={9} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export const TrackRow = memo(TrackRowImpl);
