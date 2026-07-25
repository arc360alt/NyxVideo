import { pipeline, type AutomaticSpeechRecognitionOutput, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export interface CaptionChunk {
  start: number;
  end: number;
  text: string;
}

type WorkerRequest = { type: 'transcribe'; audio: Float32Array; language?: string };

type WorkerResponse =
  | { type: 'progress'; status: string; progress?: number; file?: string }
  | { type: 'result'; chunks: CaptionChunk[]; text: string }
  | { type: 'error'; message: string };

interface WorkerScope {
  postMessage(message: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
}

const ctx = self as unknown as WorkerScope;

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

interface ProgressInfo {
  status: string;
  progress?: number;
  file?: string;
}

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    // Unquantized weights: larger download, but sidesteps ONNX Runtime errors seen
    // with this model's quantized (q8/q4, MatMulNBits) exports on some ORT builds.
    transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      dtype: 'fp32',
      progress_callback: (info: ProgressInfo) => {
        ctx.postMessage({ type: 'progress', status: info.status, progress: info.progress, file: info.file } satisfies WorkerResponse);
      },
    }).catch((err) => {
      transcriberPromise = null;
      throw err;
    });
  }
  return transcriberPromise;
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'transcribe') return;
  try {
    const transcriber = await getTranscriber();
    ctx.postMessage({ type: 'progress', status: 'transcribing' } satisfies WorkerResponse);
    const output = await transcriber(msg.audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: msg.language,
    });
    const result: AutomaticSpeechRecognitionOutput = Array.isArray(output) ? output[0] : output;
    const rawChunks = result.chunks ?? [];
    const chunks: CaptionChunk[] = rawChunks.map((c, i) => {
      const start = c.timestamp[0] ?? 0;
      const nextStart = rawChunks[i + 1]?.timestamp[0];
      const end = c.timestamp[1] ?? nextStart ?? start + 2;
      return { start, end, text: c.text.trim() };
    });
    ctx.postMessage({ type: 'result', chunks, text: result.text } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
