import { getEngine } from './engine';
import type { MediaAsset } from '../types';

/** Seeks the pooled video element for `asset` to `sourceTime` and rasterizes the current frame. */
export async function captureVideoFrame(asset: MediaAsset, sourceTime: number): Promise<string> {
  const engine = getEngine();
  const video = engine.getVideoElement(asset);

  await new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - sourceTime) < 0.01 && video.readyState >= 2) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = sourceTime;
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1;
  canvas.height = video.videoHeight || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}
