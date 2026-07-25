import { decodeAudioFromUrl } from './audioDecode';

const WHISPER_SAMPLE_RATE = 16000;

/** Extracts [startSec, endSec) from the given source audio, downmixed to mono and resampled to 16kHz for Whisper. */
export async function extractWhisperSamples(url: string, startSec: number, endSec: number): Promise<Float32Array> {
  const buffer = await decodeAudioFromUrl(url);
  const clampedStart = Math.max(0, Math.min(startSec, buffer.duration));
  const clampedEnd = Math.max(clampedStart, Math.min(endSec, buffer.duration));
  const duration = Math.max(0.05, clampedEnd - clampedStart);

  const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * WHISPER_SAMPLE_RATE), WHISPER_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0, clampedStart, duration);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}
