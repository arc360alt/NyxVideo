import { decodeAudioFromUrl } from './audioDecode';

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  bucketCount: number;
}

// Caches the in-flight *promise*, not just the resolved value. After silence
// detection splits one clip into hundreds sharing the same source asset, all
// of their WaveformThumbs mount at once and call this with the same
// (url, bucketCount) key before any of them has resolved — without caching
// the promise itself, every single one would independently re-run the
// O(samples) bucketing loop below in the same burst, which is what was
// actually freezing the tab for many seconds, not the decode (already
// promise-cached in decodeAudioFromUrl).
const peaksCache = new Map<string, Promise<WaveformPeaks>>();

async function computePeaks(url: string, bucketCount: number): Promise<WaveformPeaks> {
  const buffer = await decodeAudioFromUrl(url);
  const channel = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(channel.length / bucketCount));
  const min = new Float32Array(bucketCount);
  const max = new Float32Array(bucketCount);

  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(channel.length, start + samplesPerBucket);
    let lo = 0;
    let hi = 0;
    for (let i = start; i < end; i++) {
      const v = channel[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo;
    max[b] = hi;
  }

  return { min, max, bucketCount };
}

/** Computes min/max peaks for `bucketCount` buckets across the whole source asset. */
export function getWaveformPeaks(url: string, bucketCount: number): Promise<WaveformPeaks> {
  const key = `${url}:${bucketCount}`;
  let promise = peaksCache.get(key);
  if (!promise) {
    promise = computePeaks(url, bucketCount);
    peaksCache.set(key, promise);
    promise.catch(() => peaksCache.delete(key));
  }
  return promise;
}
