import { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { beginDragGuard } from '../../lib/dragGuard';
import { FaBookmark } from 'react-icons/fa6';

const CANDIDATE_INTERVALS = [0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function pickInterval(pxPerSecond: number): number {
  for (const interval of CANDIDATE_INTERVALS) {
    if (interval * pxPerSecond >= 70) return interval;
  }
  return CANDIDATE_INTERVALS[CANDIDATE_INTERVALS.length - 1];
}

function formatTick(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  totalWidth: number;
  headerWidth: number;
}

export function Ruler({ totalWidth, headerWidth }: Props) {
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const markers = useProjectStore((s) => s.project.markers);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const renameMarker = useProjectStore((s) => s.renameMarker);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const interval = pickInterval(pxPerSecond);
  const count = Math.ceil(totalWidth / pxPerSecond / interval) + 1;

  const scrub = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const t = Math.max(0, (clientX - rect.left) / pxPerSecond);
    setPlaying(false);
    setCurrentTime(t);
  };

  return (
    <div className="sticky top-0 z-20 flex bg-surface-0">
      <div className="sticky left-0 z-30 shrink-0 border-b border-r border-border bg-surface-0" style={{ width: headerWidth }} />
      <div
        className="relative h-7 shrink-0 cursor-pointer border-b border-border bg-surface-0"
        style={{ width: totalWidth }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = e.currentTarget;
          const endGuard = beginDragGuard();
          scrub(e.clientX, target);
          const onMove = (ev: PointerEvent) => scrub(ev.clientX, target);
          const onUp = () => {
            endGuard();
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}
      >
        {Array.from({ length: count }, (_, i) => i * interval).map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full border-l border-border pl-1 text-[10px] leading-7 text-fg-faint"
            style={{ left: t * pxPerSecond }}
          >
            {formatTick(t)}
          </div>
        ))}

        {markers.map((m) => (
          <div
            key={m.id}
            className="group absolute top-0 z-10 flex -translate-x-1/2 flex-col items-center"
            style={{ left: m.time * pxPerSecond }}
          >
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPlaying(false);
                setCurrentTime(m.time);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingMarkerId(m.id);
                setEditDraft(m.label);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeMarker(m.id);
              }}
              title={`${m.label} — double-click to rename, right-click to delete`}
              className="flex flex-col items-center text-amber-400 hover:text-amber-300"
            >
              <FaBookmark size={11} />
            </button>
            {editingMarkerId === m.id && (
              <input
                autoFocus
                value={editDraft}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={() => {
                  renameMarker(m.id, editDraft.trim() || m.label);
                  setEditingMarkerId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="absolute top-6 z-30 w-24 rounded border border-violet-500 bg-surface-1 px-1 py-0.5 text-[10px] text-fg"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
