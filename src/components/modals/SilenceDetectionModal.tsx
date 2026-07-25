import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from './Modal';
import { computeKeepSegments, detectSilenceInSource, type KeepSegment, type SilenceInterval } from '../../lib/silence';
import type { MediaClip } from '../../types';

export function SilenceDetectionModal() {
  const clipId = useProjectStore((s) => s.silenceModalClipId);
  const closeSilenceModal = useProjectStore((s) => s.closeSilenceModal);
  const applySilenceRemoval = useProjectStore((s) => s.applySilenceRemoval);
  const clip = useProjectStore((s) =>
    clipId ? (s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId) as MediaClip | undefined) : undefined,
  );
  const asset = useProjectStore((s) => (clip ? s.project.assets.find((a) => a.id === clip.assetId) : undefined));

  const [thresholdDb, setThresholdDb] = useState(-40);
  const [minDurationMs, setMinDurationMs] = useState(500);
  const [paddingMs, setPaddingMs] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [silence, setSilence] = useState<SilenceInterval[] | null>(null);
  const [keepSegments, setKeepSegments] = useState<KeepSegment[] | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!clip || !asset) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      detectSilenceInSource(asset.url, { thresholdDb, minDurationSec: minDurationMs / 1000 })
        .then((intervals) => {
          if (cancelled) return;
          setSilence(intervals);
          const keep = computeKeepSegments(clip.sourceIn, clip.sourceIn + clip.duration, intervals, paddingMs / 1000);
          setKeepSegments(keep);
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [clip?.id, clip?.sourceIn, clip?.duration, asset?.url, thresholdDb, minDurationMs, paddingMs]);

  if (!clipId || !clip) return null;

  const cutsWithinClip = silence
    ? silence.filter((s) => s.end > clip.sourceIn && s.start < clip.sourceIn + clip.duration)
    : [];
  const removedSeconds = cutsWithinClip.reduce(
    (sum, s) => sum + (Math.min(s.end, clip.sourceIn + clip.duration) - Math.max(s.start, clip.sourceIn)),
    0,
  );

  return (
    <Modal title="Silence Detection" onClose={closeSilenceModal} width={440}>
      <div className="flex flex-col gap-4 text-sm text-fg-muted">
        <p className="text-xs text-fg-faint">
          Detects quiet sections in <span className="text-fg-muted">{clip.name}</span> and removes them, pulling the
          remaining pieces together.
        </p>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Silence threshold</span>
            <span className="text-fg-faint">{thresholdDb} dB</span>
          </span>
          <input
            type="range"
            min={-70}
            max={-10}
            value={thresholdDb}
            onChange={(e) => setThresholdDb(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Minimum silence duration</span>
            <span className="text-fg-faint">{minDurationMs} ms</span>
          </span>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={minDurationMs}
            onChange={(e) => setMinDurationMs(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Padding kept around cuts</span>
            <span className="text-fg-faint">{paddingMs} ms</span>
          </span>
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={paddingMs}
            onChange={(e) => setPaddingMs(Number(e.target.value))}
          />
        </label>

        <div className="rounded-md border border-border bg-surface-1 p-3 text-xs">
          {loading && <div className="text-fg-subtle">Analyzing audio…</div>}
          {error && <div className="text-red-400">{error}</div>}
          {!loading && !error && silence && (
            <div className="flex flex-col gap-1 text-fg-subtle">
              <div>
                Found <span className="text-fg">{cutsWithinClip.length}</span> silent section
                {cutsWithinClip.length === 1 ? '' : 's'} in this clip.
              </div>
              <div>
                Removing <span className="text-fg">{removedSeconds.toFixed(2)}s</span>, leaving{' '}
                <span className="text-fg">{(clip.duration - removedSeconds).toFixed(2)}s</span>.
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={closeSilenceModal} className="rounded-md bg-surface-1 px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2">
            Cancel
          </button>
          <button
            disabled={loading || applying || !keepSegments || cutsWithinClip.length === 0}
            onClick={async () => {
              if (!keepSegments) return;
              // A clip with hundreds of silent gaps can explode into hundreds of new clips in one
              // synchronous store update + timeline mount — show "Applying…" and let it paint
              // before that runs, instead of the whole tab silently freezing with no feedback.
              setApplying(true);
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              applySilenceRemoval(clip.id, keepSegments);
              closeSilenceModal();
            }}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {applying ? 'Applying…' : 'Remove Silence'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
