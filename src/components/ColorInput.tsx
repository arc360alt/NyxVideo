import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Wraps a native color input. Dragging inside the browser's color picker fires an `input` event on
 * essentially every pixel of movement — sometimes hundreds per second — and since each one used to go
 * straight into the store (a full immutable project clone, a canvas redraw, plus the undo-history
 * subscriber's own bookkeeping), that flood of updates was what actually made the page lag, not the
 * picker itself. This keeps the swatch instantly responsive via local state, but coalesces the actual
 * store commit to once per animation frame — still feels perfectly live, at a small fraction of the update rate.
 */
export function ColorInput({ value, onChange, className }: Props) {
  const [draft, setDraft] = useState(value);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const scheduleCommit = (next: string) => {
    latestRef.current = next;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      onChange(latestRef.current);
    });
  };

  return (
    <input
      type="color"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        scheduleCommit(e.target.value);
      }}
      className={className}
    />
  );
}
