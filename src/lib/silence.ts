import { decodeAudioFromUrl } from './audioDecode';

export interface SilenceInterval {
  start: number; // seconds, relative to the full source asset
  end: number;
}

export interface SilenceOptions {
  /** dBFS threshold below which audio is considered silent (e.g. -40) */
  thresholdDb: number;
  /** minimum duration (seconds) a quiet region must last to count as silence */
  minDurationSec: number;
}

const WINDOW_SEC = 0.02;

/** Detects silent regions across an entire decoded audio source. */
export async function detectSilenceInSource(
  url: string,
  opts: SilenceOptions,
): Promise<SilenceInterval[]> {
  const buffer = await decodeAudioFromUrl(url);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.round(sampleRate * WINDOW_SEC));
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const length = buffer.length;
  const numWindows = Math.ceil(length / windowSize);
  const linearThreshold = Math.pow(10, opts.thresholdDb / 20);

  const isSilent: boolean[] = new Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(length, start + windowSize);
    let sumSquares = 0;
    let count = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      const data = channels[ch];
      for (let i = start; i < end; i++) {
        sumSquares += data[i] * data[i];
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    isSilent[w] = rms < linearThreshold;
  }

  const intervals: SilenceInterval[] = [];
  let runStart = -1;
  for (let w = 0; w <= numWindows; w++) {
    const silent = w < numWindows && isSilent[w];
    if (silent && runStart === -1) {
      runStart = w;
    } else if (!silent && runStart !== -1) {
      const startSec = (runStart * windowSize) / sampleRate;
      const endSec = (w * windowSize) / sampleRate;
      if (endSec - startSec >= opts.minDurationSec) {
        intervals.push({ start: startSec, end: Math.min(endSec, length / sampleRate) });
      }
      runStart = -1;
    }
  }

  return intervals;
}

export interface KeepSegment {
  sourceIn: number;
  sourceOut: number;
}

/**
 * Given silence intervals over the whole source, and the [sourceIn, sourceOut)
 * range a clip currently uses, returns the sub-segments to KEEP (i.e. the
 * complement of silence within that range), each shrunk by `paddingSec` of
 * silence retained on either side of a cut to avoid an abrupt chop.
 */
export function computeKeepSegments(
  sourceIn: number,
  sourceOut: number,
  silence: SilenceInterval[],
  paddingSec: number,
): KeepSegment[] {
  const relevant = silence
    .map((s) => ({ start: Math.max(s.start, sourceIn), end: Math.min(s.end, sourceOut) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const cuts = relevant.map((s) => ({
    start: Math.min(s.end, s.start + paddingSec),
    end: Math.max(s.start, s.end - paddingSec),
  })).filter((s) => s.end > s.start);

  const segments: KeepSegment[] = [];
  let cursor = sourceIn;
  for (const cut of cuts) {
    if (cut.start > cursor) {
      segments.push({ sourceIn: cursor, sourceOut: cut.start });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < sourceOut) segments.push({ sourceIn: cursor, sourceOut });

  return segments.filter((s) => s.sourceOut - s.sourceIn > 0.02);
}

export function totalSilenceDuration(intervals: SilenceInterval[]): number {
  return intervals.reduce((sum, s) => sum + (s.end - s.start), 0);
}
