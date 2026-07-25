// Peak/envelope analysis (waveform thumbnails, silence detection, Whisper
// captions) never needs full audio fidelity — decoding at the device's native
// sample rate (44.1/48kHz) makes the resulting AudioBuffer for a long
// recording enormous (a 30-minute stereo file is ~600MB+ of Float32 PCM),
// which was the cause of waveform rendering breaking down and general memory
// pressure on long imports. Decoding through a low-sample-rate
// OfflineAudioContext resamples during decode itself, so the oversized buffer
// is never created in the first place. 16kHz matches what Whisper expects
// (shared by lib/audioExtract.ts), so captions lose no quality from this.
const ANALYSIS_SAMPLE_RATE = 16000;

const cache = new Map<string, Promise<AudioBuffer>>();

/**
 * Decodes an asset's audio at `sampleRate` (default: the low analysis rate used for waveforms,
 * silence detection, and captions). Export mixdown passes a full-quality rate explicitly instead —
 * decoding at 16kHz for the final exported audio would be an audible quality loss.
 */
export async function decodeAudioFromUrl(url: string, sampleRate: number = ANALYSIS_SAMPLE_RATE): Promise<AudioBuffer> {
  const key = `${url}:${sampleRate}`;
  let promise = cache.get(key);
  if (!promise) {
    // The OfflineAudioContext's channel count only governs its (unused) destination —
    // decodeAudioData's output keeps the source's own channel layout, just resampled
    // to this context's sampleRate.
    promise = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => new OfflineAudioContext(2, 1, sampleRate).decodeAudioData(buf));
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}
