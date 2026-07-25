import { useEffect, useRef } from 'react';
import { comboFromEvent, getBindings } from '../lib/hotkeys';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** Wires the customizable, localStorage-persisted hotkey bindings to live action handlers. */
export function useHotkeys(handlers: Record<string, () => void>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const combo = comboFromEvent(e);
      const bindings = getBindings();
      const actionId = Object.keys(bindings).find((id) => bindings[id] === combo);
      if (actionId && handlersRef.current[actionId]) {
        e.preventDefault();
        handlersRef.current[actionId]();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
