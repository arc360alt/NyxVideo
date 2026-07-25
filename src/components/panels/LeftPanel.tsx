import { useState } from 'react';
import { FaClosedCaptioning, FaFilm, FaMusic, FaPhotoFilm, FaShapes, FaShuffle, FaSliders } from 'react-icons/fa6';
import { MediaTab } from './MediaTab';
import { ShapesTab } from './ShapesTab';
import { SoundsTab } from './SoundsTab';
import { EffectsTab } from './EffectsTab';
import { TransitionsTab } from './TransitionsTab';
import { CaptionsTab } from './CaptionsTab';
import { StockContentTab } from './StockContentTab';
import { ResizeHandle } from '../ResizeHandle';
import { useLayoutStore } from '../../store/useLayoutStore';

const CATEGORIES = [
  { id: 'media', label: 'Media', icon: FaFilm, Component: MediaTab },
  { id: 'shapes', label: 'Shapes', icon: FaShapes, Component: ShapesTab },
  { id: 'sounds', label: 'Sounds', icon: FaMusic, Component: SoundsTab },
  { id: 'stock', label: 'Stock Content', icon: FaPhotoFilm, Component: StockContentTab },
  { id: 'effects', label: 'Effects', icon: FaSliders, Component: EffectsTab },
  { id: 'transitions', label: 'Transitions', icon: FaShuffle, Component: TransitionsTab },
  { id: 'captions', label: 'Captions', icon: FaClosedCaptioning, Component: CaptionsTab },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

export function LeftPanel() {
  const [active, setActive] = useState<CategoryId>('media');
  const current = CATEGORIES.find((c) => c.id === active)!;
  const Content = current.Component;
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);

  return (
    <div className="flex h-full shrink-0">
      <div className="flex shrink-0 border-r border-border bg-surface-0" style={{ width: sidebarWidth }}>
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                title={c.label}
                className={`flex w-11 flex-col items-center gap-1 rounded-md py-2 text-[9px] transition ${
                  isActive ? 'bg-violet-600/20 text-violet-300' : 'text-fg-faint hover:bg-surface-1 hover:text-fg-muted'
                }`}
              >
                <Icon size={16} />
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {current.label}
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <Content />
          </div>
        </div>
      </div>
      <ResizeHandle axis="x" size={sidebarWidth} onResize={setSidebarWidth} min={220} max={560} />
    </div>
  );
}
