import type { Project } from '../types';
import { getEngine } from './engine';
import { drawFrame } from './draw';
import { projectDuration } from './time';
import { transcodeWebmToMp4 } from './ffmpegTranscode';
import { ExportCancelledError } from './exportCancelled';
import { exportProjectFast, isFastExportSupported } from './exportFast';
import { computeExportResolution, qualityToBitrate, type ExportQuality } from './exportQuality';

export { ExportCancelledError } from './exportCancelled';
export { downloadBlob } from './downloadBlob';
export type { ExportQuality } from './exportQuality';
export { RESOLUTION_PRESETS, EXPORT_QUALITY_LABELS } from './exportQuality';

export interface ExportOptions {
  fps: number;
  format: 'webm' | 'mp4';
  quality?: ExportQuality;
  /** Target export height in pixels (e.g. 1080), or omit/null to export at the project's own resolution. */
  resolutionHeight?: number | null;
  onProgress?: (phase: 'audio' | 'render' | 'transcode', ratio: number) => void;
  signal?: AbortSignal;
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

/**
 * Real-time capture fallback (MediaRecorder + ffmpeg.wasm transcode) for browsers without WebCodecs
 * support. Slow — rendering takes as long as the timeline itself plays, since it's a literal live
 * recording of the composited canvas — but works everywhere. See exportFast.ts for the fast path.
 */
async function recordComposition(
  project: Project,
  fps: number,
  quality: ExportQuality,
  resolutionHeight: number | null | undefined,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const engine = getEngine();
  await engine.warm(project);
  await engine.resumeAudio();
  if (signal?.aborted) throw new ExportCancelledError();

  // Composition happens at the project's own resolution as always; a downscaled export target is a
  // second, smaller canvas the first is blitted onto each frame (same approach as the fast path).
  const { width: outputWidth, height: outputHeight } = computeExportResolution(project.width, project.height, resolutionHeight ?? null);
  const needsDownscale = outputWidth !== project.width || outputHeight !== project.height;

  const nativeCanvas = document.createElement('canvas');
  nativeCanvas.width = project.width;
  nativeCanvas.height = project.height;
  const nativeCtx = nativeCanvas.getContext('2d')!;

  const outputCanvas = needsDownscale ? document.createElement('canvas') : nativeCanvas;
  if (needsDownscale) {
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
  }
  const outputCtx = needsDownscale ? outputCanvas.getContext('2d')! : nativeCtx;

  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Timeline is empty — add clips before exporting.');

  const audioDest = engine.beginAudioCapture();
  try {
    const videoStream = outputCanvas.captureStream(fps);
    const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);

    const mimeType = pickMimeType();
    const videoBitsPerSecond = qualityToBitrate(quality, outputWidth, outputHeight);
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start(200);

    let cancelled = false;
    await new Promise<void>((resolve) => {
      let rafId = 0;
      let startTs: number | null = null;

      const onAbort = () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const step = (ts: number) => {
        if (startTs === null) startTs = ts;
        const t = (ts - startTs) / 1000;
        const clamped = Math.min(t, duration);

        engine.syncFrame(project, clamped, true);
        drawFrame(nativeCtx, engine, project, clamped, {});
        if (needsDownscale) outputCtx.drawImage(nativeCanvas, 0, 0, outputWidth, outputHeight);
        onProgress?.(clamped / duration);

        if (t >= duration) {
          signal?.removeEventListener('abort', onAbort);
          cancelAnimationFrame(rafId);
          resolve();
          return;
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    });

    engine.pauseAll();
    recorder.stop();
    await stopped;

    if (cancelled) throw new ExportCancelledError();
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } finally {
    engine.endAudioCapture();
  }
}

async function exportProjectRealtime(project: Project, opts: ExportOptions): Promise<Blob> {
  const webm = await recordComposition(
    project,
    opts.fps,
    opts.quality ?? 'high',
    opts.resolutionHeight,
    (r) => opts.onProgress?.('render', r),
    opts.signal,
  );
  if (opts.signal?.aborted) throw new ExportCancelledError();
  if (opts.format === 'webm') return webm;
  return transcodeWebmToMp4(webm, (r) => opts.onProgress?.('transcode', r), opts.signal);
}

export async function exportProject(project: Project, opts: ExportOptions): Promise<Blob> {
  if (isFastExportSupported()) {
    return exportProjectFast(project, {
      fps: opts.fps,
      format: opts.format,
      quality: opts.quality,
      resolutionHeight: opts.resolutionHeight,
      signal: opts.signal,
      onProgress: (phase, ratio) => opts.onProgress?.(phase, ratio),
    });
  }
  return exportProjectRealtime(project, opts);
}
