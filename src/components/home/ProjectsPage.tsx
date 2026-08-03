import { useEffect, useRef, useState } from 'react';
import { useLibraryStore, type ProjectSummary } from '../../store/useLibraryStore';
import { importWorkspace } from '../../lib/nvFormat';
import { formatRelativeTime } from '../../lib/relativeTime';
import { FaFilm, FaFolderOpen, FaTrash, FaUpload } from 'react-icons/fa6';
import { FiCopy, FiPlus } from 'react-icons/fi';

function ProjectCard({ project }: { project: ProjectSummary }) {
  const openProject = useLibraryStore((s) => s.openProject);
  const deleteProject = useLibraryStore((s) => s.deleteProject);
  const duplicateProject = useLibraryStore((s) => s.duplicateProject);
  const renameProject = useLibraryStore((s) => s.renameProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface-1 transition hover:border-violet-500">
      <button
        onClick={() => void openProject(project.id)}
        className="flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-0"
      >
        {project.thumbnail ? (
          <img src={project.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <FaFilm size={28} className="text-fg-faint" />
        )}
      </button>
      <div className="flex flex-col gap-1 p-3">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              const name = draft.trim() || project.name;
              if (name !== project.name) void renameProject(project.id, name);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="rounded border border-violet-500 bg-surface-0 px-1.5 py-1 text-sm text-fg outline-none"
          />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(project.name);
              setEditing(true);
            }}
            className="truncate text-left text-sm font-medium text-fg hover:text-violet-300"
            title="Click to rename"
          >
            {project.name}
          </button>
        )}
        <div className="flex items-center justify-between text-[11px] text-fg-faint">
          <span>
            {project.width}×{project.height}
          </span>
          <span>{formatRelativeTime(project.updatedAt)}</span>
        </div>
        <div className="mt-1 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => void openProject(project.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-2 py-1 text-[11px] text-fg-muted hover:bg-violet-600 hover:text-white"
          >
            <FaFolderOpen size={10} /> Open
          </button>
          <button
            onClick={() => void duplicateProject(project.id)}
            className="flex items-center justify-center rounded bg-surface-2 px-2 py-1 text-fg-muted hover:bg-surface-3"
            title="Duplicate"
          >
            <FiCopy size={11} />
          </button>
          <button
            onClick={() => (confirmDelete ? void deleteProject(project.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            className={`flex items-center justify-center rounded px-2 py-1 ${confirmDelete ? 'bg-red-600 text-white' : 'bg-surface-2 text-fg-muted hover:bg-red-950 hover:text-red-400'}`}
            title={confirmDelete ? 'Click again to confirm delete' : 'Delete'}
          >
            <FaTrash size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const projects = useLibraryStore((s) => s.projects);
  const loading = useLibraryStore((s) => s.loading);
  const opening = useLibraryStore((s) => s.opening);
  const refreshList = useLibraryStore((s) => s.refreshList);
  const createProject = useLibraryStore((s) => s.createProject);
  const importProject = useLibraryStore((s) => s.importProject);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const project = await importWorkspace(file);
      await importProject(project);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-0 text-fg">
      {opening && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-surface-0/90 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-fg-muted">Opening project…</p>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <span className="text-lg font-semibold tracking-tight text-fg">Projects</span>
          <p className="mt-0.5 text-xs text-fg-faint">Your projects, saved locally in this browser.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".nv,application/json"
            className="hidden"
            onChange={(e) => void handleImport(e.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-fg-muted hover:bg-surface-3"
          >
            <FaUpload size={12} /> Import Workspace
          </button>
          <button
            onClick={() => void createProject()}
            className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            <FiPlus size={14} /> New Project
          </button>
        </div>
      </div>

      {importError && <div className="mx-6 mt-3 rounded bg-red-950 px-3 py-2 text-xs text-red-300">{importError}</div>}

      <div className="flex-1 p-6">
        {loading && <div className="text-sm text-fg-faint">Loading…</div>}
        {!loading && projects.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-fg-faint">
            <FaFilm size={32} />
            <p className="text-sm">No projects yet. Create one to get started.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
