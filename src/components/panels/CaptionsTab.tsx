import { useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useCaptionsStore } from '../../store/useCaptionsStore';
import { toSrt, toVtt } from '../../lib/srtVtt';
import { downloadBlob } from '../../lib/downloadBlob';
import { FiDownload, FiTrash2 } from 'react-icons/fi';
import { FaClosedCaptioning, FaWandMagicSparkles } from 'react-icons/fa6';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export function CaptionsTab() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const addCaptionsAsTextClips = useProjectStore((s) => s.addCaptionsAsTextClips);

  const sourceClipId = useCaptionsStore((s) => s.sourceClipId);
  const setSourceClipId = useCaptionsStore((s) => s.setSourceClipId);
  const generating = useCaptionsStore((s) => s.generating);
  const progress = useCaptionsStore((s) => s.progress);
  const error = useCaptionsStore((s) => s.error);
  const captions = useCaptionsStore((s) => s.captions);
  const generate = useCaptionsStore((s) => s.generate);
  const updateCaptionText = useCaptionsStore((s) => s.updateCaptionText);
  const removeCaption = useCaptionsStore((s) => s.removeCaption);

  const mediaClips = useMemo(
    () =>
      project.tracks
        .flatMap((t) => t.clips)
        .filter((c) => c.kind === 'video' || c.kind === 'audio')
        .map((c) => ({ id: c.id, name: c.name })),
    [project.tracks],
  );

  const selectedIsMedia =
    selectedClipId && project.tracks.flatMap((t) => t.clips).some((c) => c.id === selectedClipId && (c.kind === 'video' || c.kind === 'audio'));

  return (
    <div className="nyx-scroll flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Source Clip</div>
        <select
          value={sourceClipId ?? ''}
          onChange={(e) => setSourceClipId(e.target.value || null)}
          className="w-full rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-fg"
        >
          <option value="">Select a video or audio clip…</option>
          {mediaClips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {selectedIsMedia && selectedClipId !== sourceClipId && (
          <button
            onClick={() => setSourceClipId(selectedClipId!)}
            className="mt-1 text-[10px] text-violet-400 hover:text-violet-300"
          >
            Use clip selected on timeline
          </button>
        )}
      </div>

      <button
        onClick={() => void generate()}
        disabled={!sourceClipId || generating}
        className="flex items-center justify-center gap-2 rounded-md bg-violet-600 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
      >
        <FaWandMagicSparkles size={12} /> {generating ? 'Generating…' : 'Generate Captions'}
      </button>
      <p className="text-[10px] text-fg-faint">
        Runs a local Whisper speech-to-text model right in your browser (no audio leaves your device). The model (~150MB) downloads
        once and is cached after that.
      </p>

      {generating && (
        <div className="rounded border border-border bg-surface-1 px-2.5 py-2 text-[11px] text-fg-muted">
          {progress?.status === 'transcribing'
            ? 'Transcribing audio…'
            : progress?.file
              ? `Downloading model: ${progress.file}${progress.progress ? ` (${Math.round(progress.progress)}%)` : ''}`
              : 'Loading model…'}
        </div>
      )}
      {error && <div className="rounded bg-red-950 px-2.5 py-2 text-[11px] text-red-300">{error}</div>}

      {captions && captions.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-faint">
            <span>{captions.length} captions</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {captions.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 rounded border border-border bg-surface-1 p-2">
                <div className="flex items-center justify-between text-[10px] text-fg-faint">
                  <span>
                    {formatTime(c.start)} – {formatTime(c.end)}
                  </span>
                  <button onClick={() => removeCaption(c.id)} className="hover:text-red-400">
                    <FiTrash2 size={11} />
                  </button>
                </div>
                <textarea
                  value={c.text}
                  onChange={(e) => updateCaptionText(c.id, e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded border border-border bg-surface-0 px-1.5 py-1 text-xs text-fg"
                />
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 flex flex-col gap-1.5 bg-surface-0 pt-2">
            <button
              onClick={() => sourceClipId && addCaptionsAsTextClips(sourceClipId, captions)}
              className="flex items-center justify-center gap-2 rounded-md bg-violet-600 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
            >
              <FaClosedCaptioning size={12} /> Add to Timeline as Text Layer
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => downloadBlob(new Blob([toSrt(captions)], { type: 'text/plain' }), 'captions.srt')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded bg-surface-2 py-1.5 text-[11px] text-fg-muted hover:bg-surface-3"
              >
                <FiDownload size={11} /> .srt
              </button>
              <button
                onClick={() => downloadBlob(new Blob([toVtt(captions)], { type: 'text/plain' }), 'captions.vtt')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded bg-surface-2 py-1.5 text-[11px] text-fg-muted hover:bg-surface-3"
              >
                <FiDownload size={11} /> .vtt
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
