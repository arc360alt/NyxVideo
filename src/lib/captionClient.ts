import type { CaptionChunk } from '../workers/captionWorker';

export type { CaptionChunk };

export interface TranscribeProgress {
  status: string;
  progress?: number;
  file?: string;
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/captionWorker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function transcribeAudio(
  audio: Float32Array,
  onProgress: (p: TranscribeProgress) => void,
): Promise<{ chunks: CaptionChunk[]; text: string }> {
  return new Promise((resolve, reject) => {
    const w = getWorker();

    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress({ status: msg.status, progress: msg.progress, file: msg.file });
      } else if (msg.type === 'result') {
        w.removeEventListener('message', onMessage);
        resolve({ chunks: msg.chunks, text: msg.text });
      } else if (msg.type === 'error') {
        w.removeEventListener('message', onMessage);
        reject(new Error(msg.message));
      }
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ type: 'transcribe', audio }, [audio.buffer]);
  });
}
