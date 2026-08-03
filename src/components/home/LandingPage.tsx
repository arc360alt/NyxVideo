import { useLibraryStore } from '../../store/useLibraryStore';
import { FiArrowRight } from 'react-icons/fi';
import { FaGithub } from 'react-icons/fa6';

export function LandingPage() {
  const goToProjects = useLibraryStore((s) => s.goToProjects);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-surface-0 px-6 text-center text-fg">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 65% 55% at 50% 42%, black 35%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 50% 42%, black 35%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <span className="text-5xl font-semibold tracking-tight text-fg">NyxVideo</span>
        <p className="max-w-md text-sm text-fg-muted">
          A full-featured video editor that runs entirely in your browser. Cut, layer, and export your projects
          without installing anything.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => void goToProjects()}
            className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(255,255,255,0.6)] active:translate-y-0"
          >
            Go to projects
            <FiArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
          </button>
          <a
            href="https://github.com/arc360alt/NyxVideo"
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
            aria-label="View on GitHub"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border-strong text-fg-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-fg-muted hover:text-fg"
          >
            <FaGithub size={18} />
          </a>
        </div>
      </div>
    </div>
  );
}
