import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
// eslint-disable-next-line import/no-unresolved
import coreURL from '@ffmpeg/core?url';
// eslint-disable-next-line import/no-unresolved
import wasmURL from '@ffmpeg/core/wasm?url';
import { ExportCancelledError } from './exportCancelled';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const [loadedCoreURL, loadedWasmURL] = await Promise.all([
        toBlobURL(coreURL, 'text/javascript'),
        toBlobURL(wasmURL, 'application/wasm'),
      ]);
      await ffmpeg.load({ coreURL: loadedCoreURL, wasmURL: loadedWasmURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }
  return loadPromise;
}

export async function transcodeWebmToMp4(
  webmBlob: Blob,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new ExportCancelledError();
  const ffmpeg = await getFFmpeg();
  const handleProgress = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ffmpeg.on('progress', handleProgress);

  // ffmpeg.wasm has no way to cancel a running exec() short of killing its worker outright —
  // terminate() does that, so the cached instance is invalidated and reloaded fresh next export.
  const onAbort = () => {
    ffmpeg.terminate();
    ffmpegInstance = null;
    loadPromise = null;
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const inputData = new Uint8Array(await webmBlob.arrayBuffer());
    await ffmpeg.writeFile('input.webm', inputData);
    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      'output.mp4',
    ]);
    if (signal?.aborted) throw new ExportCancelledError();
    const data = await ffmpeg.readFile('output.mp4');
    await ffmpeg.deleteFile('input.webm');
    await ffmpeg.deleteFile('output.mp4');
    const bytes = data as Uint8Array;
    return new Blob([bytes.slice()], { type: 'video/mp4' });
  } catch (err) {
    if (signal?.aborted) throw new ExportCancelledError();
    throw err;
  } finally {
    ffmpeg.off('progress', handleProgress);
    signal?.removeEventListener('abort', onAbort);
  }
}
