import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  QUALITY_HIGH,
} from 'mediabunny';
import type { Project } from '../types';
import { getEngine } from './engine';
import { drawFrame } from './draw';
import { projectDuration } from './time';
import { mixdownAudio, projectHasAudibleAudio, EXPORT_AUDIO_SAMPLE_RATE } from './audioMixdown';
import { getActiveVideoEntries, buildAssetFrameSources } from './exportFrames';
import { ExportCancelledError } from './exportCancelled';

export interface FastExportOptions {
  fps: number;
  format: 'webm' | 'mp4';
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
  if (signal?.aborted) throw new ExportCancelledError();

  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Timeline is empty — add clips before exporting.');

  const engine = getEngine();
  await engine.warm(project);

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d')!;

  const videoCodec = await getFirstEncodableVideoCodec(format === 'mp4' ? ['avc', 'hevc'] : ['vp9', 'vp8'], {
    width: project.width,
    height: project.height,
    bitrate: QUALITY_HIGH,
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
        bitrate: QUALITY_HIGH,
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

  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(videoSource);

  let audioSource: AudioBufferSource | null = null;
  if (audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_HIGH });
    output.addAudioTrack(audioSource);
  }

  if (signal?.aborted) throw new ExportCancelledError();
  await output.start();

  const onAbort = () => {
    void output.cancel();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (audioSource) {
      onProgress?.('audio', 0);
      const mixed = await mixdownAudio(project, duration, EXPORT_AUDIO_SAMPLE_RATE);
      if (signal?.aborted) throw new ExportCancelledError();
      await audioSource.add(mixed);
      onProgress?.('audio', 1);
    }

    const assetById = new Map(project.assets.map((a) => [a.id, a]));
    const frameDuration = 1 / fps;
    const frameCount = Math.max(1, Math.round(duration * fps));

    // One sequential, decode-ahead frame source per video asset (see exportFrames.ts) — this is what
    // makes export fast for real video: pulling frames forward through the decoder instead of
    // seeking a live <video> element once per output frame, which is what made a 17-minute timeline
    // take vastly longer than 17 minutes to render (thousands of individual seek+decode round trips).
    const frameSources = await buildAssetFrameSources(project, frameCount, frameDuration, duration, assetById);
    if (signal?.aborted) throw new ExportCancelledError();

    try {
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
        drawFrame(ctx, engine, project, t, {});
        await videoSource.add(t, frameDuration);
        onProgress?.('render', (i + 1) / frameCount);
      }

      if (signal?.aborted) throw new ExportCancelledError();
      await output.finalize();
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
