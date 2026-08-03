import { useLibraryStore } from '../../store/useLibraryStore';

export function SiteTopBar() {
  const view = useLibraryStore((s) => s.view);
  const goToLanding = useLibraryStore((s) => s.goToLanding);
  const goToProjects = useLibraryStore((s) => s.goToProjects);

  const navBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-1 hover:text-fg'
    }`;

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface-0 px-4">
      <button onClick={goToLanding} className="text-sm font-semibold tracking-tight text-fg">
        NyxVideo
      </button>
      <div className="flex items-center gap-1">
        <button onClick={goToLanding} className={navBtn(view === 'landing')}>
          Home
        </button>
        <button onClick={() => void goToProjects()} className={navBtn(view === 'projects')}>
          Projects
        </button>
      </div>
    </div>
  );
}
