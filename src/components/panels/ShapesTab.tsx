import { SHAPE_LIBRARY } from '../../lib/shapes';
import { useProjectStore } from '../../store/useProjectStore';
import type { ShapeType } from '../../types';
import { FiType } from 'react-icons/fi';

function ShapeIcon({ type }: { type: ShapeType }) {
  const common = { fill: '#a78bfa', stroke: '#a78bfa' };
  switch (type) {
    case 'rect':
      return <rect x="6" y="10" width="28" height="20" rx="2" {...common} />;
    case 'ellipse':
      return <ellipse cx="20" cy="20" rx="14" ry="10" {...common} />;
    case 'triangle':
      return <polygon points="20,8 34,32 6,32" {...common} />;
    case 'star':
      return (
        <polygon
          points="20,6 24,16 35,16 26,23 29,34 20,27 11,34 14,23 5,16 16,16"
          {...common}
        />
      );
    case 'pentagon':
      return <polygon points="20,6 34,16 29,32 11,32 6,16" {...common} />;
    case 'hexagon':
      return <polygon points="12,6 28,6 36,20 28,34 12,34 4,20" {...common} />;
    case 'line':
      return <line x1="6" y1="20" x2="34" y2="20" stroke="#a78bfa" strokeWidth="3" />;
    case 'arrow':
      return (
        <g stroke="#a78bfa" strokeWidth="3" fill="none">
          <line x1="6" y1="20" x2="30" y2="20" />
          <polyline points="22,12 30,20 22,28" />
        </g>
      );
  }
}

export function ShapesTab() {
  const addShapeToTimeline = useProjectStore((s) => s.addShapeToTimeline);
  const addTextToTimeline = useProjectStore((s) => s.addTextToTimeline);

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Text</div>
        <button
          draggable
          onDragStart={(e) => e.dataTransfer.setData('application/x-nyx-text', '1')}
          onClick={() => addTextToTimeline()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-1 py-3 text-sm text-fg hover:border-violet-500 hover:text-violet-300"
        >
          <FiType /> Add Text
        </button>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Shape Library</div>
        <div className="grid grid-cols-3 gap-2">
          {SHAPE_LIBRARY.map((shape) => (
            <button
              key={shape.type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-nyx-shape', shape.type)}
              onClick={() => addShapeToTimeline(shape.type)}
              title={shape.label}
              className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-1 p-2 hover:border-violet-500"
            >
              <svg width="40" height="40" viewBox="0 0 40 40">
                <ShapeIcon type={shape.type} />
              </svg>
              <span className="text-[10px] text-fg-subtle">{shape.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
