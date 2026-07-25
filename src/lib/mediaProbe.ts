import type { MediaAsset, MediaKind } from '../types';
import { newId } from './id';

function kindFromMime(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

function captureVideoThumbnail(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
}

export async function probeMediaFile(file: File): Promise<MediaAsset> {
  const kind = kindFromMime(file);
  if (!kind) throw new Error(`Unsupported file type: ${file.type || file.name}`);
  const url = URL.createObjectURL(file);

  if (kind === 'video') {
    return await new Promise<MediaAsset>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = url;
      video.onloadedmetadata = () => {
        const finish = () => {
          const thumbnail = captureVideoThumbnail(video);
          resolve({
            id: newId(),
            name: file.name,
            kind,
            url,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            thumbnail,
          });
        };
        try {
          video.currentTime = Math.min(0.1, video.duration / 2);
          video.onseeked = finish;
        } catch {
          finish();
        }
      };
      video.onerror = () => reject(new Error(`Could not read video: ${file.name}`));
    });
  }

  if (kind === 'audio') {
    return await new Promise<MediaAsset>((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      audio.onloadedmetadata = () => {
        resolve({
          id: newId(),
          name: file.name,
          kind,
          url,
          duration: audio.duration,
          width: 0,
          height: 0,
        });
      };
      audio.onerror = () => reject(new Error(`Could not read audio: ${file.name}`));
    });
  }

  // image
  return await new Promise<MediaAsset>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        id: newId(),
        name: file.name,
        kind,
        url,
        duration: 0,
        width: img.naturalWidth,
        height: img.naturalHeight,
        thumbnail: url,
      });
    };
    img.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
    img.src = url;
  });
}
