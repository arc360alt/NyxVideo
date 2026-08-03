export interface HotkeyAction {
  id: string;
  label: string;
  defaultKey: string;
  group: string;
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: 'undo', label: 'Undo', defaultKey: 'Ctrl+Z', group: 'Editing' },
  { id: 'redo', label: 'Redo', defaultKey: 'Ctrl+Y', group: 'Editing' },
  { id: 'playPause', label: 'Play / Pause', defaultKey: 'Space', group: 'Playback' },
  { id: 'stepBack', label: 'Previous frame', defaultKey: 'ArrowLeft', group: 'Playback' },
  { id: 'stepForward', label: 'Next frame', defaultKey: 'ArrowRight', group: 'Playback' },
  { id: 'skipStart', label: 'Skip to start', defaultKey: 'Home', group: 'Playback' },
  { id: 'skipEnd', label: 'Skip to end', defaultKey: 'End', group: 'Playback' },
  { id: 'splitAtPlayhead', label: 'Split at playhead', defaultKey: 'S', group: 'Editing' },
  { id: 'splitKeepLeft', label: 'Split & keep left side', defaultKey: 'Q', group: 'Editing' },
  { id: 'splitKeepRight', label: 'Split & keep right side', defaultKey: 'W', group: 'Editing' },
  { id: 'freezeFrame', label: 'Insert freeze frame', defaultKey: 'F', group: 'Editing' },
  { id: 'deleteClip', label: 'Delete selected clip(s)', defaultKey: 'Delete', group: 'Editing' },
  { id: 'duplicateClip', label: 'Duplicate selected clip(s)', defaultKey: 'Ctrl+D', group: 'Editing' },
  { id: 'copyClip', label: 'Copy selected clip(s)', defaultKey: 'Ctrl+C', group: 'Editing' },
  { id: 'pasteClip', label: 'Paste clip(s) at playhead', defaultKey: 'Ctrl+V', group: 'Editing' },
  { id: 'selectAll', label: 'Select all clips', defaultKey: 'Ctrl+A', group: 'Editing' },
  { id: 'toggleRippleDelete', label: 'Toggle ripple delete', defaultKey: 'R', group: 'Editing' },
  { id: 'toggleSnap', label: 'Toggle clip snapping', defaultKey: 'N', group: 'Editing' },
  { id: 'toggleAutoScroll', label: 'Toggle timeline auto-scroll', defaultKey: 'L', group: 'Editing' },
  { id: 'addMarker', label: 'Add bookmark at playhead', defaultKey: 'M', group: 'Markers' },
  { id: 'addKeyframe', label: 'Add keyframe at playhead', defaultKey: 'K', group: 'Animation' },
];

const STORAGE_KEY = 'nyxvideo:hotkeys';

export function getBindings(): Record<string, string> {
  const overrides = readOverrides();
  const bindings: Record<string, string> = {};
  for (const action of HOTKEY_ACTIONS) bindings[action.id] = overrides[action.id] ?? action.defaultKey;
  return bindings;
}

function readOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setBinding(actionId: string, combo: string) {
  const overrides = readOverrides();
  overrides[actionId] = combo;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetBinding(actionId: string) {
  const overrides = readOverrides();
  delete overrides[actionId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetAllBindings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

export function isModifierKey(key: string): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(key);
}
