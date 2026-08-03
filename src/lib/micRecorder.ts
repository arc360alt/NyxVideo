const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickMimeType(): string | undefined {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/** Wraps getUserMedia + MediaRecorder for recording a microphone voice note. */
export interface RecordedClip {
  blob: Blob;
  /** Wall-clock recording length in seconds — Firefox never resolves `duration` from a
   *  MediaRecorder blob's own metadata (it stays Infinity/NaN forever, unlike Chrome, which can
   *  recover it by seeking), so this is the only reliable source of truth for how long the clip
   *  actually is. */
  duration: number;
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = Date.now();
  }

  stop(): Promise<RecordedClip> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === 'inactive') {
        reject(new Error('Not recording'));
        return;
      }
      const duration = (Date.now() - this.startedAt) / 1000;
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        this.cleanup();
        resolve({ blob, duration });
      };
      recorder.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
