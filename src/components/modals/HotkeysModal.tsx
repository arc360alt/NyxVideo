import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from './Modal';
import {
  HOTKEY_ACTIONS,
  comboFromEvent,
  getBindings,
  isModifierKey,
  resetAllBindings,
  resetBinding,
  setBinding,
} from '../../lib/hotkeys';

const GROUPS = ['Playback', 'Editing', 'Markers', 'Animation'];

export function HotkeysModal() {
  const open = useProjectStore((s) => s.hotkeysModalOpen);
  const setOpen = useProjectStore((s) => s.setHotkeysModalOpen);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  useEffect(() => {
    if (open) setBindings(getBindings());
  }, [open]);

  useEffect(() => {
    if (!listeningFor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (isModifierKey(e.key)) return;
      if (e.key === 'Escape') {
        setListeningFor(null);
        return;
      }
      const combo = comboFromEvent(e);
      setBinding(listeningFor, combo);
      setBindings(getBindings());
      setListeningFor(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listeningFor]);

  if (!open) return null;

  return (
    <Modal title="Keyboard Shortcuts" onClose={() => setOpen(false)} width={480}>
      <div className="flex flex-col gap-4 text-sm text-fg-muted">
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-faint">{group}</div>
            <div className="flex flex-col gap-1">
              {HOTKEY_ACTIONS.filter((a) => a.group === group).map((action) => (
                <div key={action.id} className="flex items-center justify-between rounded bg-surface-1 px-2.5 py-1.5">
                  <span className="text-xs text-fg-muted">{action.label}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setListeningFor(action.id)}
                      className={`min-w-[76px] rounded border px-2 py-1 text-[11px] font-mono ${
                        listeningFor === action.id
                          ? 'border-violet-500 bg-violet-950 text-violet-200'
                          : 'border-border-strong bg-surface-2 text-fg-muted hover:border-border-strong'
                      }`}
                    >
                      {listeningFor === action.id ? 'Press key…' : bindings[action.id]}
                    </button>
                    <button
                      onClick={() => {
                        resetBinding(action.id);
                        setBindings(getBindings());
                      }}
                      title="Reset to default"
                      className="text-[10px] text-fg-faint hover:text-fg-muted"
                    >
                      reset
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-between">
          <button
            onClick={() => {
              resetAllBindings();
              setBindings(getBindings());
            }}
            className="text-xs text-fg-faint hover:text-fg-muted"
          >
            Reset all to defaults
          </button>
          <button onClick={() => setOpen(false)} className="rounded-md bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
