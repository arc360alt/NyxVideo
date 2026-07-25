import type { Project } from '../types';
import { getEngine } from './engine';
import { drawFrame } from './draw';
import { projectDuration } from './time';
import { transcodeWebmToMp4 } from './ffmpegTranscode';
import { ExportCancelledError } from './exportCancelled';
import { exportProjectFast, isFastExportSupported } from './exportFast';

export { ExportCancelledError } from './exportCancelled';
export { downloadBlob } from './downloadBlob';

export interface ExportOptions {
  fps: number;
  format: 'webm' | 'mp4';
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
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const engine = getEngine();
  await engine.warm(project);
  await engine.resumeAudio();
  if (signal?.aborted) throw new ExportCancelledError();

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d')!;

  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Timeline is empty — add clips before exporting.');

  const audioDest = engine.beginAudioCapture();
  try {
    const videoStream = canvas.captureStream(fps);
    const combined = new MediaStream([...videoStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 10_000_000 });
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
        drawFrame(ctx, engine, project, clamped, {});
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
  const webm = await recordComposition(project, opts.fps, (r) => opts.onProgress?.('render', r), opts.signal);
  if (opts.signal?.aborted) throw new ExportCancelledError();
  if (opts.format === 'webm') return webm;
  return transcodeWebmToMp4(webm, (r) => opts.onProgress?.('transcode', r), opts.signal);
}

export async function exportProject(project: Project, opts: ExportOptions): Promise<Blob> {
  if (isFastExportSupported()) {
    return exportProjectFast(project, {
      fps: opts.fps,
      format: opts.format,
      signal: opts.signal,
      onProgress: (phase, ratio) => opts.onProgress?.(phase, ratio),
    });
  }
  return exportProjectRealtime(project, opts);
}
