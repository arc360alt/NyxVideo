import { useEffect, useRef, useState } from 'react';
import { getWaveformPeaks } from '../../lib/waveform';

// Buckets scale with the *whole source asset's* duration (not just this clip's
// trimmed slice) so that zooming into a small piece of a long recording still
// has real per-pixel detail available instead of a handful of coarse blocks.
const BUCKETS_PER_SECOND = 25;
const MIN_ASSET_BUCKETS = 400;
const MAX_ASSET_BUCKETS = 50_000;

// The canvas's own backing-store resolution is capped independently of how
// wide the clip is rendered on screen — a 30-minute clip at high zoom can be
// hundreds of thousands of CSS pixels wide, which isn't a sane canvas size.
// Above this cap the browser upscales slightly via CSS, which is a much
// smaller (barely visible) stretch than the previous fixed-400px bitmap was.
const MAX_CANVAS_WIDTH = 2000;

interface Props {
  url: string;
  color?: string;
  /** full source asset duration, seconds — used to slice peaks down to this clip's trimmed range */
  assetDuration: number;
  sourceIn: number;
  duration: number;
  pxPerSecond: number;
}

export function WaveformThumb({ url, color = '#fbbf24', assetDuration, sourceIn, duration, pxPerSecond }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<{ min: Float32Array; max: Float32Array } | null>(null);

  const assetBucketCount = Math.min(
    MAX_ASSET_BUCKETS,
    Math.max(MIN_ASSET_BUCKETS, Math.round(assetDuration * BUCKETS_PER_SECOND)),
  );

  useEffect(() => {
    let cancelled = false;
    getWaveformPeaks(url, assetBucketCount)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        // No decodable audio track (e.g. a silent video) — leave the waveform blank.
      });
    return () => {
      cancelled = true;
    };
  }, [url, assetBucketCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || assetDuration <= 0) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = Math.max(1, duration * pxPerSecond);
    const canvasWidth = Math.round(Math.min(MAX_CANVAS_WIDTH, cssWidth) * dpr);
    const canvasHeight = Math.round(32 * dpr);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;

    const bucketDuration = assetDuration / peaks.min.length;
    const startIdx = Math.max(0, Math.floor(sourceIn / bucketDuration));
    const endIdx = Math.min(peaks.min.length, Math.max(startIdx + 1, Math.ceil((sourceIn + duration) / bucketDuration)));
    const sliceLength = endIdx - startIdx;
    const barWidth = w / sliceLength;

    for (let i = 0; i < sliceLength; i++) {
      const idx = startIdx + i;
      const y1 = ((1 + peaks.min[idx]) / 2) * h;
      const y2 = ((1 + peaks.max[idx]) / 2) * h;
      ctx.fillRect(i * barWidth, Math.min(y1, y2), Math.max(1, barWidth), Math.max(1, Math.abs(y2 - y1)));
    }
  }, [peaks, color, assetDuration, sourceIn, duration, pxPerSecond]);

  return <canvas ref={canvasRef} className="h-full w-full opacity-80" />;
}
