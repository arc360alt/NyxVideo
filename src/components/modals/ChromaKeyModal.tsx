import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from './Modal';
import { getEngine } from '../../lib/engine';
import { getChromaKeyer } from '../../lib/chromaKey';
import { DEFAULT_CHROMA_KEY, type MediaClip } from '../../types';
import { FiCrosshair } from 'react-icons/fi';

const PREVIEW_WIDTH = 380;

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = 10;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle = (Math.round(x / size) + Math.round(y / size)) % 2 === 0 ? '#3f3f46' : '#27272a';
      ctx.fillRect(x, y, size, size);
    }
  }
}

export function ChromaKeyModal() {
  const clipId = useProjectStore((s) => s.chromaKeyModalClipId);
  const closeChromaKeyModal = useProjectStore((s) => s.closeChromaKeyModal);
  const setChromaKey = useProjectStore((s) => s.setChromaKey);
  const clip = useProjectStore((s) =>
    clipId ? (s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId) as MediaClip | undefined) : undefined,
  );
  const asset = useProjectStore((s) => (clip ? s.project.assets.find((a) => a.id === clip.assetId) : undefined));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const [previewTime, setPreviewTime] = useState(0);
  const [eyedropperBusy, setEyedropperBusy] = useState(false);

  const chromaKey = clip?.chromaKey ?? DEFAULT_CHROMA_KEY;

  useEffect(() => setPreviewTime(0), [clipId]);

  const drawFrame = () => {
    if (!clip || !asset) return;
    const engine = getEngine();
    const el = clip.kind === 'video' ? engine.getVideoElement(asset) : engine.getImageElement(asset);
    const nativeW = clip.kind === 'video' ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth;
    const nativeH = clip.kind === 'video' ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight;
    if (!nativeW || !nativeH) return;

    const rawCanvas = rawCanvasRef.current;
    if (rawCanvas.width !== nativeW || rawCanvas.height !== nativeH) {
      rawCanvas.width = nativeW;
      rawCanvas.height = nativeH;
    }
    rawCanvas.getContext('2d')?.drawImage(el, 0, 0);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const displayW = PREVIEW_WIDTH;
    const displayH = Math.round((nativeH / nativeW) * displayW);
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }
    const ctx = canvas.getContext('2d')!;
    drawCheckerboard(ctx, displayW, displayH);
    if (chromaKey.enabled) {
      const keyed = getChromaKeyer().apply(el, nativeW, nativeH, chromaKey);
      ctx.drawImage(keyed, 0, 0, displayW, displayH);
    } else {
      ctx.drawImage(el, 0, 0, displayW, displayH);
    }
  };

  // Seeks the shared pooled element to the previewed frame (video only — images have nothing to seek).
  useEffect(() => {
    if (!clip || !asset) return;
    if (clip.kind !== 'video') {
      drawFrame();
      return;
    }
    const engine = getEngine();
    const el = engine.getVideoElement(asset);
    const sourceTime = clip.sourceIn + previewTime * (clip.speed || 1);
    const clamped = Number.isFinite(el.duration) ? Math.max(0, Math.min(sourceTime, el.duration - 0.01)) : Math.max(0, sourceTime);
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - clamped) < 0.01 && el.readyState >= 2) {
      drawFrame();
      return;
    }
    const onSeeked = () => drawFrame();
    el.addEventListener('seeked', onSeeked, { once: true });
    el.currentTime = clamped;
    return () => el.removeEventListener('seeked', onSeeked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTime, clipId, asset?.url]);

  // Re-keys the already-seeked frame whenever the settings change, without re-seeking.
  useEffect(() => {
    drawFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chromaKey.enabled, chromaKey.color, chromaKey.similarity, chromaKey.smoothness, chromaKey.spill]);

  if (!clipId || !clip) return null;

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const raw = rawCanvasRef.current;
    if (!canvas || raw.width === 0) return;
    const rect = canvas.getBoundingClientRect();
    // Map the click from screen space -> the visible (display-resolution) canvas -> the raw
    // (native-resolution) canvas, since eyedropper accuracy should reflect the source pixels, not
    // whatever the preview happens to be scaled to on screen.
    const visibleX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const visibleY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const rawX = Math.max(0, Math.min(raw.width - 1, Math.round((visibleX / canvas.width) * raw.width)));
    const rawY = Math.max(0, Math.min(raw.height - 1, Math.round((visibleY / canvas.height) * raw.height)));
    const ctx = raw.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(rawX, rawY, 1, 1).data;
    const hex = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    setChromaKey(clip.id, { color: hex, enabled: true });
  };

  const handleEyedropper = async () => {
    if (!window.EyeDropper) return;
    setEyedropperBusy(true);
    try {
      const result = await new window.EyeDropper().open();
      setChromaKey(clip.id, { color: result.sRGBHex, enabled: true });
    } catch {
      // user cancelled (pressed Escape) — nothing to do
    } finally {
      setEyedropperBusy(false);
    }
  };

  return (
    <Modal title="Chroma Key" onClose={closeChromaKeyModal} width={440}>
      <div className="flex flex-col gap-4 text-sm text-fg-muted">
        <p className="text-xs text-fg-faint">
          Removes a solid background color (green/blue screen) from <span className="text-fg-muted">{clip.name}</span>. Click
          anywhere on the preview to pick the color to remove.
        </p>

        <div className="overflow-hidden rounded-md border border-border">
          <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full cursor-crosshair" style={{ imageRendering: 'pixelated' }} />
        </div>

        {clip.kind === 'video' && (
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            <span className="flex justify-between">
              <span>Preview frame</span>
              <span className="text-fg-faint">{previewTime.toFixed(1)}s / {clip.duration.toFixed(1)}s</span>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0.01, clip.duration - 0.01)}
              step={0.05}
              value={previewTime}
              onChange={(e) => setPreviewTime(Number(e.target.value))}
            />
          </label>
        )}

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <input
              type="checkbox"
              checked={chromaKey.enabled}
              onChange={(e) => setChromaKey(clip.id, { enabled: e.target.checked })}
            />
            Enable chroma key
          </label>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-6 w-6 shrink-0 rounded border border-border-strong" style={{ backgroundColor: chromaKey.color }} />
            {typeof window !== 'undefined' && window.EyeDropper && (
              <button
                onClick={() => void handleEyedropper()}
                disabled={eyedropperBusy}
                title="Pick a color from anywhere on screen"
                className="flex items-center gap-1.5 rounded-md border border-border-strong bg-surface-1 px-2 py-1.5 text-xs text-fg hover:border-violet-500 hover:text-violet-300 disabled:opacity-50"
              >
                <FiCrosshair size={12} /> Eyedropper
              </button>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Similarity</span>
            <span className="text-fg-faint">{chromaKey.similarity}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={chromaKey.similarity}
            onChange={(e) => setChromaKey(clip.id, { similarity: Number(e.target.value) })}
          />
          <span className="text-[10px] text-fg-faint">How close a pixel's color needs to be to the key color to get removed.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Smoothness</span>
            <span className="text-fg-faint">{chromaKey.smoothness}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={chromaKey.smoothness}
            onChange={(e) => setChromaKey(clip.id, { smoothness: Number(e.target.value) })}
          />
          <span className="text-[10px] text-fg-faint">Softens the edge between kept and removed areas.</span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span className="flex justify-between">
            <span>Spill Suppression</span>
            <span className="text-fg-faint">{chromaKey.spill}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={chromaKey.spill}
            onChange={(e) => setChromaKey(clip.id, { spill: Number(e.target.value) })}
          />
          <span className="text-[10px] text-fg-faint">Reduces the color cast the background leaves on your subject's edges.</span>
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={closeChromaKeyModal} className="rounded-md bg-violet-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-500">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
