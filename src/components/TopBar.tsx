import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { useThemeStore } from '../store/useThemeStore';
import { exportWorkspace, suggestNvFilename } from '../lib/nvFormat';
import { downloadBlob } from '../lib/downloadBlob';
import { getBindings } from '../lib/hotkeys';
import { FiDownload, FiMoon, FiSettings, FiSun } from 'react-icons/fi';
import { FaBoxArchive, FaHouse, FaKeyboard, FaRotateLeft, FaRotateRight } from 'react-icons/fa6';

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const project = useProjectStore((s) => s.project);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setExportModalOpen = useProjectStore((s) => s.setExportModalOpen);
  const setProjectSettingsModalOpen = useProjectStore((s) => s.setProjectSettingsModalOpen);
  const setHotkeysModalOpen = useProjectStore((s) => s.setHotkeysModalOpen);
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const goHome = useLibraryStore((s) => s.goHome);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [exportingNv, setExportingNv] = useState(false);
  const bindings = getBindings();
  const key = (id: string) => (bindings[id] ? ` (${bindings[id]})` : '');

  const handleExportWorkspace = async () => {
    setExportingNv(true);
    try {
      const blob = await exportWorkspace(project);
      downloadBlob(blob, suggestNvFilename(project.name));
    } finally {
      setExportingNv(false);
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface-0 px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void goHome()}
          title="Back to projects"
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg"
        >
          <FaHouse size={15} />
        </button>
        <span className="text-lg font-semibold tracking-tight text-fg">NyxVideo</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setProjectName(draft.trim() || 'Untitled Project');
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="rounded border border-border-strong bg-surface-1 px-2 py-1 text-sm text-fg outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            className="rounded px-2 py-1 text-sm text-fg-subtle hover:bg-surface-1 hover:text-fg"
          >
            {name}
          </button>
        )}
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`Undo${key('undo')}`}
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <FaRotateLeft size={14} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={`Redo${key('redo')}`}
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <FaRotateRight size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleTheme}
          title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg"
        >
          {themeMode === 'dark' ? <FiSun size={15} /> : <FiMoon size={15} />}
        </button>
        <button
          onClick={() => setHotkeysModalOpen(true)}
          title="Keyboard shortcuts"
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg"
        >
          <FaKeyboard size={15} />
        </button>
        <button
          onClick={() => setProjectSettingsModalOpen(true)}
          title="Project settings"
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg"
        >
          <FiSettings size={15} />
        </button>
        <button
          onClick={() => void handleExportWorkspace()}
          disabled={exportingNv}
          title="Export workspace (.nv) to continue editing on another computer"
          className="rounded p-2 text-fg-subtle hover:bg-surface-1 hover:text-fg disabled:opacity-50"
        >
          <FaBoxArchive size={14} />
        </button>
        <button
          onClick={() => setExportModalOpen(true)}
          className="ml-2 flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
        >
          <FiDownload size={14} /> Export
        </button>
      </div>
    </div>
  );
}
