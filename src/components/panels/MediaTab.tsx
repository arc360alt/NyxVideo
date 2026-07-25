import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { MicRecorder } from '../../lib/micRecorder';
import { probeMediaFile } from '../../lib/mediaProbe';
import { FiAlertTriangle, FiFilm, FiImage, FiMic, FiMusic, FiPlus, FiSquare, FiTrash2, FiUploadCloud } from 'react-icons/fi';

export function MediaTab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const allAssets = useProjectStore((s) => s.project.assets);
  const assets = useMemo(() => allAssets.filter((a) => !a.builtin), [allAssets]);
  const importFiles = useProjectStore((s) => s.importFiles);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const addMediaToTimeline = useProjectStore((s) => s.addMediaToTimeline);
  const addAsset = useProjectStore((s) => s.addAsset);
  const currentTime = useProjectStore((s) => s.currentTime);
  const relinkAsset = useProjectStore((s) => s.relinkAsset);
  const isImporting = useProjectStore((s) => s.isImporting);
  const importError = useProjectStore((s) => s.importError);

  const handleFiles = (files: FileList | null) => {
    if (files && files.length) void importFiles(files);
  };

  const handleRelink = (assetId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) relinkAsset(assetId, file);
    };
    input.click();
  };

  const micRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      micRef.current?.cancel();
    },
    [],
  );

  const startRecording = async () => {
    setRecordError(null);
    try {
      const mic = new MicRecorder();
      await mic.start();
      micRef.current = mic;
      setRecording(true);
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 200);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Could not access microphone');
    }
  };

  const stopRecording = async () => {
    const mic = micRef.current;
    if (!mic) return;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setProcessingRecording(true);
    try {
      const blob = await mic.stop();
      const file = new File([blob], `Voice Note ${new Date().toLocaleTimeString()}`, { type: blob.type });
      const asset = await probeMediaFile(file);
      addAsset(asset);
      addMediaToTimeline(asset.id, { start: currentTime });
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Recording failed');
    } finally {
      micRef.current = null;
      setProcessingRecording(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong p-5 text-center text-sm text-fg-subtle transition hover:border-violet-500 hover:text-violet-300"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <FiUploadCloud size={22} />
        <span>Drop video, audio or image files here, or click to browse</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
        {!recording ? (
          <button
            onClick={() => void startRecording()}
            disabled={processingRecording}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-fg-muted hover:text-red-400 disabled:opacity-50"
          >
            <FiMic size={13} /> {processingRecording ? 'Processing…' : 'Record a voice note'}
          </button>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {elapsed.toFixed(1)}s
            </span>
            <button
              onClick={() => void stopRecording()}
              className="ml-auto flex items-center gap-1.5 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
            >
              <FiSquare size={11} /> Stop
            </button>
          </>
        )}
      </div>
      {recordError && <div className="text-xs text-red-400">{recordError}</div>}

      {isImporting && <div className="text-xs text-fg-subtle">Importing media…</div>}
      {importError && <div className="text-xs text-red-400">{importError}</div>}

      <div className="nyx-scroll flex-1 overflow-y-auto">
        {assets.length === 0 && !isImporting && (
          <div className="mt-6 text-center text-xs text-fg-faint">No media imported yet.</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) =>
            asset.missing ? (
              <div
                key={asset.id}
                className="flex flex-col overflow-hidden rounded-md border border-dashed border-amber-700 bg-amber-950/20 text-left"
              >
                <div className="flex h-16 flex-col items-center justify-center gap-1 overflow-hidden bg-surface-0 text-amber-500">
                  <FiAlertTriangle size={18} />
                  <span className="text-[9px]">Missing</span>
                </div>
                <div className="truncate px-2 py-1 text-[11px] text-fg-muted" title={asset.sourceFileName ?? asset.name}>
                  {asset.name}
                </div>
                <button
                  onClick={() => handleRelink(asset.id)}
                  className="m-1 mt-0 rounded bg-amber-700/80 py-1 text-[10px] text-white hover:bg-amber-600"
                >
                  Relink file…
                </button>
              </div>
            ) : (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/x-nyx-asset', asset.id)}
                className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-surface-1 text-left"
              >
                <div className="flex h-16 items-center justify-center overflow-hidden bg-surface-0">
                  {asset.thumbnail ? (
                    <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" />
                  ) : asset.kind === 'audio' ? (
                    <FiMusic className="text-fg-faint" size={22} />
                  ) : asset.kind === 'video' ? (
                    <FiFilm className="text-fg-faint" size={22} />
                  ) : (
                    <FiImage className="text-fg-faint" size={22} />
                  )}
                </div>
                <div className="truncate px-2 py-1 text-[11px] text-fg-muted" title={asset.attribution ?? asset.name}>
                  {asset.name}
                </div>
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition group-hover:opacity-100">
                  <button
                    className="rounded bg-violet-600 p-1.5 text-white hover:bg-violet-500"
                    title="Add to timeline"
                    onClick={() => addMediaToTimeline(asset.id)}
                  >
                    <FiPlus size={14} />
                  </button>
                  <button
                    className="rounded bg-surface-3 p-1.5 text-white hover:bg-red-600"
                    title="Remove"
                    onClick={() => removeAsset(asset.id)}
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
