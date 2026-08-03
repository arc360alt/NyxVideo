import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import type { Project } from '../types';
import { getEngine } from './engine';
import { drawFrame } from './draw';
import { projectDuration } from './time';
import { mixdownAudio, projectHasAudibleAudio, EXPORT_AUDIO_SAMPLE_RATE } from './audioMixdown';
import { getActiveVideoEntries, buildAssetFrameSources } from './exportFrames';
import { ExportCancelledError } from './exportCancelled';
import { computeExportResolution, qualityToMediabunny, type ExportQuality } from './exportQuality';

export interface FastExportOptions {
  fps: number;
  format: 'webm' | 'mp4';
  quality?: ExportQuality;
  /** Target export height in pixels (e.g. 1080), or omit/null to export at the project's own resolution. */
  resolutionHeight?: number | null;
  onProgress?: (phase: 'audio' | 'render', ratio: number) => void;
  signal?: AbortSignal;
}

/** Whether this browser can run the frame-by-frame WebCodecs export path at all. */
export function isFastExportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
}

/**
 * Renders the project to a video file frame-by-frame using WebCodecs, encoding as fast as the CPU
 * allows rather than being bound to the timeline's real-time duration (the old MediaRecorder-based
 * path had to "play" the whole thing in real time to capture it — a 30-minute timeline took 30
 * minutes to render). Audio is mixed down non-realtime via OfflineAudioContext first, then muxed
 * alongside the encoded video frames directly into the target container — no separate transcode pass.
 */
export async function exportProjectFast(project: Project, opts: FastExportOptions): Promise<Blob> {
  const { fps, format, onProgress, signal } = opts;
  const quality = qualityToMediabunny(opts.quality ?? 'high');
  if (signal?.aborted) throw new ExportCancelledError();

  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Timeline is empty — add clips before exporting.');

  const engine = getEngine();
  await engine.warm(project);

  // Composition always happens at the project's own resolution (clip transforms are authored in
  // that coordinate space) — a downscaled export target is a second, smaller canvas that the first
  // is blitted onto each frame, so exporting at e.g. 720p from a 4K project is cheaper to encode
  // without needing to touch any of the drawing/positioning math.
  const { width: outputWidth, height: outputHeight } = computeExportResolution(
    project.width,
    project.height,
    opts.resolutionHeight ?? null,
  );
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

  const videoCodec = await getFirstEncodableVideoCodec(format === 'mp4' ? ['avc', 'hevc'] : ['vp9', 'vp8'], {
    width: outputWidth,
    height: outputHeight,
    bitrate: quality,
  });
  if (!videoCodec) throw new Error('This browser cannot encode video for export.');

  const wantsAudio = projectHasAudibleAudio(project);
  // AAC is preferred for MP4 (most widely compatible), but not every browser ships an AAC encoder —
  // notably Chromium on Linux, which has WebCodecs video encoding but no AAC. Opus is a valid MP4
  // audio codec too (just less universally supported by players), so it's a real fallback rather than
  // silently dropping audio, which is what happened here before this was caught by an actual export test.
  const audioCodec = wantsAudio
    ? await getFirstEncodableAudioCodec(format === 'mp4' ? ['aac', 'opus'] : ['opus', 'vorbis'], {
        numberOfChannels: 2,
        sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
        bitrate: quality,
      })
    : null;
  if (wantsAudio && !audioCodec) {
    throw new Error(
      `This browser has no audio encoder available for ${format.toUpperCase()} export. Try the other format, or a different browser.`,
    );
  }

  const output = new Output({
    format: format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(outputCanvas, { codec: videoCodec, bitrate: quality });
  output.addVideoTrack(videoSource);

  let audioSource: AudioBufferSource | null = null;
  if (audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: quality });
    output.addAudioTrack(audioSource);
  }

  if (signal?.aborted) throw new ExportCancelledError();
  await output.start();

  const onAbort = () => {
    void output.cancel();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const t0 = performance.now();
    if (audioSource) {
      onProgress?.('audio', 0);
      const mixed = await mixdownAudio(project, duration, EXPORT_AUDIO_SAMPLE_RATE);
      if (signal?.aborted) throw new ExportCancelledError();
      await audioSource.add(mixed);
      onProgress?.('audio', 1);
    }
    const t1 = performance.now();
    console.log(`[export perf] audio mixdown: ${(t1 - t0).toFixed(0)}ms`);

    const assetById = new Map(project.assets.map((a) => [a.id, a]));
    const frameDuration = 1 / fps;
    const frameCount = Math.max(1, Math.round(duration * fps));

    // One sequential, decode-ahead frame source per video asset (see exportFrames.ts) — this is what
    // makes export fast for real video: pulling frames forward through the decoder instead of
    // seeking a live <video> element once per output frame, which is what made a 17-minute timeline
    // take vastly longer than 17 minutes to render (thousands of individual seek+decode round trips).
    const frameSources = await buildAssetFrameSources(project, frameCount, frameDuration, duration, assetById);
    const t2 = performance.now();
    console.log(`[export perf] frame source setup: ${(t2 - t1).toFixed(0)}ms`);
    for (const [assetId, source] of frameSources) {
      console.log(`[export perf] asset ${assetId}: ${source ? 'FAST sequential decode' : 'FALLBACK per-frame seek (slow!)'}`);
    }
    if (signal?.aborted) throw new ExportCancelledError();

    try {
      let lastLog = performance.now();
      for (let i = 0; i < frameCount; i++) {
        if (signal?.aborted) throw new ExportCancelledError();
        const t = Math.min(duration, i * frameDuration);

        for (const entry of getActiveVideoEntries(project, t, assetById)) {
          const source = frameSources.get(entry.asset.id);
          if (source) {
            const frame = await source.next();
            if (frame) engine.setExportFrameOverride(engine.getVideoElement(entry.asset), frame.canvas);
          } else {
            // Fast decode wasn't available for this asset (unsupported codec/container for
            // mediabunny's demuxer, etc.) — fall back to precise per-frame seeking just for it.
            await engine.seekVideoAssetExact(entry.asset, entry.sourceTime);
          }
        }

        if (signal?.aborted) throw new ExportCancelledError();
        drawFrame(nativeCtx, engine, project, t, {});
        if (needsDownscale) outputCtx.drawImage(nativeCanvas, 0, 0, outputWidth, outputHeight);
        await videoSource.add(t, frameDuration);
        onProgress?.('render', (i + 1) / frameCount);

        if (i > 0 && i % 60 === 0) {
          const now = performance.now();
          console.log(
            `[export perf] frame ${i}/${frameCount}: ${(now - lastLog).toFixed(0)}ms for last 60 frames (${((now - lastLog) / 60).toFixed(1)}ms/frame)`,
          );
          lastLog = now;
        }
      }
      const t3 = performance.now();
      console.log(`[export perf] frame loop total: ${(t3 - t2).toFixed(0)}ms for ${frameCount} frames (${((t3 - t2) / frameCount).toFixed(1)}ms/frame avg)`);

      if (signal?.aborted) throw new ExportCancelledError();
      await output.finalize();
      const t4 = performance.now();
      console.log(`[export perf] finalize: ${(t4 - t3).toFixed(0)}ms`);
      console.log(`[export perf] TOTAL: ${(t4 - t0).toFixed(0)}ms`);
    } finally {
      for (const source of frameSources.values()) source?.dispose();
      engine.clearExportFrameOverrides();
    }
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') {
      try {
        await output.cancel();
      } catch {
        /* already tearing down */
      }
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    engine.pauseAll();
  }

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('Export failed to produce output.');
  return new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
}
