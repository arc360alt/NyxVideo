import { useState } from 'react';
import { TRANSITION_LIBRARY } from '../../lib/transitions';
import type { TransitionType } from '../../types';
import {
  FaAnglesLeft,
  FaAnglesRight,
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaCircleDot,
  FaCircleHalfStroke,
  FaMagnifyingGlassMinus,
  FaMagnifyingGlassPlus,
  FaMoon,
  FaSun,
} from 'react-icons/fa6';

const ICONS: Record<TransitionType, React.ComponentType<{ size?: number }>> = {
  crossfade: FaCircleHalfStroke,
  'fade-black': FaMoon,
  'fade-white': FaSun,
  'wipe-left': FaArrowLeft,
  'wipe-right': FaArrowRight,
  'wipe-up': FaArrowUp,
  'wipe-down': FaArrowDown,
  'slide-left': FaAnglesLeft,
  'slide-right': FaAnglesRight,
  'zoom-in': FaMagnifyingGlassPlus,
  'zoom-out': FaMagnifyingGlassMinus,
  iris: FaCircleDot,
};

export function TransitionsTab() {
  const [duration, setDuration] = useState(1);

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-faint">
          <span>Default Duration</span>
          <span className="normal-case text-fg-subtle">{duration.toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full"
        />
        <p className="mt-1 text-[10px] text-fg-faint">
          Drag a transition onto the small circle between two adjacent clips on a video track.
        </p>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Transitions</div>
        <div className="grid grid-cols-3 gap-2">
          {TRANSITION_LIBRARY.map((tr) => {
            const Icon = ICONS[tr.type];
            return (
              <div
                key={tr.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-nyx-transition', tr.type);
                  e.dataTransfer.setData('application/x-nyx-transition-duration', String(duration));
                }}
                title={tr.name}
                className="flex cursor-grab flex-col items-center gap-1.5 rounded-md border border-border bg-surface-1 p-2.5 text-center hover:border-fuchsia-500"
              >
                <Icon size={18} />
                <span className="text-[10px] text-fg-muted">{tr.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
