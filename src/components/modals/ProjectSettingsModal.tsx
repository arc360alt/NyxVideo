import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from './Modal';

const RESOLUTION_PRESETS = [
  { label: '1920 × 1080 (Landscape HD)', w: 1920, h: 1080 },
  { label: '1280 × 720 (Landscape)', w: 1280, h: 720 },
  { label: '3840 × 2160 (4K)', w: 3840, h: 2160 },
  { label: '1080 × 1920 (Vertical / Reels)', w: 1080, h: 1920 },
  { label: '1080 × 1080 (Square)', w: 1080, h: 1080 },
  { label: 'Custom', w: 0, h: 0 },
];

const FPS_PRESETS = [24, 25, 30, 48, 50, 60];

export function ProjectSettingsModal() {
  const open = useProjectStore((s) => s.projectSettingsModalOpen);
  const setOpen = useProjectStore((s) => s.setProjectSettingsModalOpen);
  const project = useProjectStore((s) => s.project);
  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings);
  const zoomToScrubberEnabled = useProjectStore((s) => s.zoomToScrubberEnabled);
  const toggleZoomToScrubber = useProjectStore((s) => s.toggleZoomToScrubber);

  const [widthDraft, setWidthDraft] = useState(String(project.width));
  const [heightDraft, setHeightDraft] = useState(String(project.height));
  const [fpsDraft, setFpsDraft] = useState(String(project.fps));

  useEffect(() => setWidthDraft(String(project.width)), [project.width]);
  useEffect(() => setHeightDraft(String(project.height)), [project.height]);
  useEffect(() => setFpsDraft(String(project.fps)), [project.fps]);

  if (!open) return null;

  const matchingPreset = RESOLUTION_PRESETS.find((p) => p.w === project.width && p.h === project.height);

  const commitWidth = () => {
    const n = Math.round(Number(widthDraft));
    if (Number.isFinite(n) && n >= 2) updateProjectSettings({ width: n });
    else setWidthDraft(String(project.width));
  };
  const commitHeight = () => {
    const n = Math.round(Number(heightDraft));
    if (Number.isFinite(n) && n >= 2) updateProjectSettings({ height: n });
    else setHeightDraft(String(project.height));
  };
  const commitFps = () => {
    const n = Math.round(Number(fpsDraft));
    if (Number.isFinite(n) && n >= 1) updateProjectSettings({ fps: n });
    else setFpsDraft(String(project.fps));
  };

  return (
    <Modal title="Project Settings" onClose={() => setOpen(false)} width={440}>
      <div className="flex flex-col gap-4 text-sm text-fg-muted">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Resolution</div>
          <select
            value={matchingPreset ? matchingPreset.label : 'Custom'}
            onChange={(e) => {
              const preset = RESOLUTION_PRESETS.find((p) => p.label === e.target.value);
              if (preset && preset.w > 0) updateProjectSettings({ width: preset.w, height: preset.h });
            }}
            className="mb-2 w-full rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-fg"
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-fg-subtle">
              Width
              <input
                type="number"
                value={widthDraft}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={commitWidth}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-subtle">
              Height
              <input
                type="number"
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                onBlur={commitHeight}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
          </div>
          <p className="mt-1 text-[10px] text-fg-faint">Changing resolution rescales existing clip positions to fit.</p>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Frame Rate</div>
          <div className="flex flex-wrap gap-1.5">
            {FPS_PRESETS.map((fps) => (
              <button
                key={fps}
                onClick={() => updateProjectSettings({ fps })}
                className={`rounded px-2.5 py-1 text-xs ${project.fps === fps ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted hover:bg-surface-2'}`}
              >
                {fps}
              </button>
            ))}
            <input
              type="number"
              value={fpsDraft}
              onChange={(e) => setFpsDraft(e.target.value)}
              onBlur={commitFps}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-16 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-fg"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Background</div>
          <div className="flex gap-2">
            <button
              onClick={() => updateProjectSettings({ background: { mode: 'color' } })}
              className={`flex-1 rounded-md border py-2 text-xs ${project.background.mode === 'color' ? 'border-violet-500 bg-violet-950 text-violet-200' : 'border-border bg-surface-1 text-fg-muted'}`}
            >
              Solid Color
            </button>
            <button
              onClick={() => updateProjectSettings({ background: { mode: 'blur' } })}
              className={`flex-1 rounded-md border py-2 text-xs ${project.background.mode === 'blur' ? 'border-violet-500 bg-violet-950 text-violet-200' : 'border-border bg-surface-1 text-fg-muted'}`}
            >
              Blurred Fill
            </button>
          </div>
          {project.background.mode === 'color' && (
            <input
              type="color"
              value={project.background.color}
              onChange={(e) => updateProjectSettings({ background: { color: e.target.value } })}
              className="mt-2 h-8 w-full rounded border border-border bg-surface-1"
            />
          )}
          {project.background.mode === 'blur' && (
            <p className="mt-2 text-[10px] text-fg-faint">
              Fills empty space around clips that don't match the canvas aspect ratio with a blurred, zoomed copy of the frame instead of a solid color.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Editor</div>
          <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-1 px-2.5 py-2 text-xs text-fg-subtle">
            <span>
              <span className="text-fg">Zoom follows scrubber</span>
              <p className="mt-0.5 text-[10px] text-fg-faint">
                Keeps the playhead pinned at the same spot on screen while you zoom the timeline in or out,
                instead of the view drifting to wherever it happens to land. Works whether or not auto-scroll is on.
              </p>
            </span>
            <input
              type="checkbox"
              checked={zoomToScrubberEnabled}
              onChange={toggleZoomToScrubber}
              className="mt-0.5 shrink-0"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={() => setOpen(false)} className="rounded-md bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
