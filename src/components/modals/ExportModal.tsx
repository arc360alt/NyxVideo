import { useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from './Modal';
import { projectDuration } from '../../lib/time';
import { RESOLUTION_PRESETS, EXPORT_QUALITY_LABELS, type ExportQuality } from '../../lib/exportQuality';
import { FiDownload } from 'react-icons/fi';

// Dynamically imported — this pulls in mediabunny (WebCodecs muxing) and the ffmpeg.wasm fallback,
// which shouldn't be part of the app's initial bundle when most sessions never open this modal.
const loadExportLib = () => import('../../lib/export');

type Phase = 'idle' | 'audio' | 'render' | 'transcode' | 'done' | 'error';

const QUALITY_OPTIONS: ExportQuality[] = ['very-low', 'low', 'medium', 'high', 'very-high'];

export function ExportModal() {
  const open = useProjectStore((s) => s.exportModalOpen);
  const setOpen = useProjectStore((s) => s.setExportModalOpen);
  const project = useProjectStore((s) => s.project);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const duration = projectDuration(project);

  const [format, setFormat] = useState<'webm' | 'mp4'>('webm');
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState<ExportQuality>('high');
  // null = export at the project's own resolution
  const [resolutionHeight, setResolutionHeight] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolutionOptions = RESOLUTION_PRESETS.filter((h) => h < project.height);

  if (!open) return null;

  const busy = phase === 'audio' || phase === 'render' || phase === 'transcode';

  const handleClose = () => {
    if (busy) return;
    setOpen(false);
    setPhase('idle');
    setProgress(0);
    setResultBlob(null);
    setError(null);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleExport = async () => {
    setPlaying(false);
    setError(null);
    setResultBlob(null);
    setPhase('render');
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { exportProject, downloadBlob } = await loadExportLib();
      const blob = await exportProject(project, {
        fps,
        format,
        quality,
        resolutionHeight,
        signal: controller.signal,
        onProgress: (p, r) => {
          setPhase(p);
          setProgress(r);
        },
      });
      setResultBlob(blob);
      setPhase('done');
      downloadBlob(blob, `${project.name.replace(/\s+/g, '_') || 'nyxvideo-export'}.${format}`);
    } catch (err) {
      const { ExportCancelledError } = await loadExportLib();
      if (err instanceof ExportCancelledError) {
        setPhase('idle');
        setProgress(0);
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <Modal title="Export Video" onClose={handleClose} width={420}>
      <div className="flex flex-col gap-4 text-sm text-fg-muted">
        <div className="text-xs text-fg-faint">
          Timeline length: {duration.toFixed(1)}s — {project.width}×{project.height}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Format</div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => setFormat('webm')}
              className={`flex-1 rounded-md border py-2 text-xs ${format === 'webm' ? 'border-violet-500 bg-violet-950 text-violet-200' : 'border-border bg-surface-1 text-fg-muted'}`}
            >
              WebM<div className="text-[10px] text-fg-faint">Fast, no transcode</div>
            </button>
            <button
              disabled={busy}
              onClick={() => setFormat('mp4')}
              className={`flex-1 rounded-md border py-2 text-xs ${format === 'mp4' ? 'border-violet-500 bg-violet-950 text-violet-200' : 'border-border bg-surface-1 text-fg-muted'}`}
            >
              MP4<div className="text-[10px] text-fg-faint">Widely compatible</div>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-faint">
            <span>Quality</span>
            <span className="normal-case text-fg-faint">lower = faster to encode, smaller file</span>
          </div>
          <div className="flex gap-1">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q}
                disabled={busy}
                onClick={() => setQuality(q)}
                className={`flex-1 rounded-md border py-1.5 text-[10px] ${quality === q ? 'border-violet-500 bg-violet-950 text-violet-200' : 'border-border bg-surface-1 text-fg-muted'}`}
              >
                {EXPORT_QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span>Resolution</span>
          <select
            disabled={busy}
            value={resolutionHeight ?? 'original'}
            onChange={(e) => setResolutionHeight(e.target.value === 'original' ? null : Number(e.target.value))}
            className="rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-fg"
          >
            <option value="original">
              Original ({project.width}×{project.height})
            </option>
            {resolutionOptions.map((h) => (
              <option key={h} value={h}>
                {h}p ({Math.round((project.width * h) / project.height)}×{h})
              </option>
            ))}
          </select>
          <p className="text-[10px] text-fg-faint">Exporting smaller than the project's own resolution renders and encodes faster.</p>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Frame rate</span>
            <span className="text-fg-faint">{fps} fps</span>
          </span>
          <input type="range" min={15} max={60} step={1} disabled={busy} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
        </label>

        {phase !== 'idle' && (
          <div className="rounded-md border border-border bg-surface-1 p-3 text-xs">
            {phase === 'audio' && <div className="mb-1 text-fg-subtle">Mixing audio…</div>}
            {phase === 'render' && <div className="mb-1 text-fg-subtle">Rendering frames…</div>}
            {phase === 'transcode' && <div className="mb-1 text-fg-subtle">Converting to MP4…</div>}
            {phase === 'done' && <div className="mb-1 text-emerald-400">Export complete — download started.</div>}
            {phase === 'error' && <div className="mb-1 text-red-400">{error}</div>}
            {busy && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-violet-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={busy ? handleCancel : handleClose}
            className="rounded-md bg-surface-1 px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2"
          >
            {busy ? 'Cancel Export' : phase === 'done' ? 'Close' : 'Cancel'}
          </button>
          {resultBlob ? (
            <button
              onClick={async () => {
                const { downloadBlob } = await loadExportLib();
                downloadBlob(resultBlob, `${project.name.replace(/\s+/g, '_') || 'nyxvideo-export'}.${format}`);
              }}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
            >
              <FiDownload size={12} /> Download again
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={busy || duration <= 0}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              <FiDownload size={12} /> {busy ? 'Exporting…' : 'Start Export'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
