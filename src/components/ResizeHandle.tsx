import { beginDragGuard } from '../lib/dragGuard';

interface Props {
  axis: 'x' | 'y';
  /** when true, dragging in the positive direction shrinks (used when the handle sits on the "far" edge of a panel) */
  invert?: boolean;
  size: number;
  onResize: (newSize: number) => void;
  min: number;
  max: number;
}

export function ResizeHandle({ axis, invert, size, onResize, min, max }: Props) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = axis === 'x' ? e.clientX : e.clientY;
    const startSize = size;
    const endGuard = beginDragGuard();

    const onMove = (ev: PointerEvent) => {
      const pos = axis === 'x' ? ev.clientX : ev.clientY;
      const delta = (pos - startPos) * (invert ? -1 : 1);
      onResize(Math.min(max, Math.max(min, startSize + delta)));
    };
    const onUp = () => {
      endGuard();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className={`shrink-0 bg-transparent transition-colors hover:bg-violet-500/40 active:bg-violet-500/60 ${
        axis === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      }`}
    />
  );
}
