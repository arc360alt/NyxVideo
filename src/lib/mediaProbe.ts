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

/** MediaRecorder output (e.g. the mic voice-note recorder) has no duration written into its
 *  container, so `loadedmetadata` reports `duration: Infinity` until the file is scanned by
 *  seeking near its end — Firefox in particular never resolves this on its own, and a clip with
 *  an Infinity duration poisons every downstream timeline-width calculation. */
function resolveDuration(el: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(el.duration)) return Promise.resolve(el.duration);
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('seeked', onSeeked);
      window.clearTimeout(timeout);
      // Read duration before resetting position — seeking back to 0 doesn't affect it, but this
      // keeps the two concerns (what we report vs. where we leave the element) clearly separate.
      const result = Number.isFinite(el.duration) ? el.duration : 0;
      el.currentTime = 0;
      resolve(result);
    };
    // `seeked` fires once, when the browser has actually finished honoring the currentTime
    // request (clamped to the real end of the media, which is exactly what forces it to compute
    // the true duration). `timeupdate` fires repeatedly *during* that process and can report a
    // still-settling, bogus small duration on its very first tick — that was resolving here too
    // early with garbage like 0.1s instead of waiting for the seek to actually land.
    const onSeeked = () => settle();
    el.addEventListener('seeked', onSeeked);
    el.currentTime = 1e101;
    // A handful of engines never fire `seeked` for this trick — don't hang the import forever.
    const timeout = window.setTimeout(settle, 4000);
  });
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
        void (async () => {
          const duration = await resolveDuration(video);
          const finish = () => {
            const thumbnail = captureVideoThumbnail(video);
            resolve({
              id: newId(),
              name: file.name,
              kind,
              url,
              duration,
              width: video.videoWidth,
              height: video.videoHeight,
              thumbnail,
            });
          };
          try {
            video.currentTime = duration > 0 ? Math.min(0.1, duration / 2) : 0;
            video.onseeked = finish;
          } catch {
            finish();
          }
        })();
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
        void (async () => {
          const duration = await resolveDuration(audio);
          resolve({
            id: newId(),
            name: file.name,
            kind,
            url,
            duration,
            width: 0,
            height: 0,
          });
        })();
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
