import { memo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';

interface Props {
  pxPerSecond: number;
  headerWidth: number;
}

/** Isolated so the once-per-frame currentTime update during playback doesn't re-render the whole timeline tree. */
function PlayheadImpl({ pxPerSecond, headerWidth }: Props) {
  const currentTime = useProjectStore((s) => s.currentTime);

  return (
    <div
      className="pointer-events-none absolute top-0 z-20 w-px bg-rose-500"
      style={{ left: headerWidth + currentTime * pxPerSecond, height: '100%' }}
    >
      <div className="absolute -left-1.5 -top-0 h-2.5 w-3 rounded-b-sm bg-rose-500" />
    </div>
  );
}

export const Playhead = memo(PlayheadImpl);
