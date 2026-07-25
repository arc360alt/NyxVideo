import type { MediaClip, Project } from '../types';
import { computeGain } from './clipUtils';
import { decodeAudioFromUrl } from './audioDecode';

export const EXPORT_AUDIO_SAMPLE_RATE = 48000;

export function projectHasAudibleAudio(project: Project): boolean {
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'video' && clip.kind !== 'audio') continue;
      if (computeGain(clip as MediaClip, track) > 0) return true;
    }
  }
  return false;
}

/**
 * Renders the project's full mixed audio as a single AudioBuffer via an OfflineAudioContext, so it
 * runs as fast as the CPU allows instead of in real time. Speed-adjusted clips are resampled through
 * AudioBufferSourceNode.playbackRate — unlike HTMLMediaElement.preservesPitch (used for live playback),
 * the Web Audio API has no time-stretch primitive, so preservePitch has no effect on exported audio;
 * sped-up/slowed-down clips will always shift pitch with speed in the export.
 */
export async function mixdownAudio(
  project: Project,
  duration: number,
  sampleRate: number = EXPORT_AUDIO_SAMPLE_RATE,
): Promise<AudioBuffer> {
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const totalFrames = Math.max(1, Math.ceil(duration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  const jobs: Promise<void>[] = [];
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'video' && clip.kind !== 'audio') continue;
      const mc = clip as MediaClip;
      const gainValue = computeGain(mc, track);
      if (gainValue <= 0) continue;
      const asset = assetById.get(mc.assetId);
      if (!asset || asset.missing) continue;

      jobs.push(
        (async () => {
          try {
            const buffer = await decodeAudioFromUrl(asset.url, sampleRate);
            const speed = mc.speed || 1;
            const startTime = Math.max(0, Math.min(duration, mc.start));
            if (startTime >= duration) return;
            const sourceOffset = Math.max(0, mc.sourceIn);
            const sourceSpan = Math.min(mc.duration * speed, Math.max(0, buffer.duration - sourceOffset));
            if (sourceSpan <= 0) return;

            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = speed;
            const gain = offlineCtx.createGain();
            gain.gain.value = gainValue;
            source.connect(gain).connect(offlineCtx.destination);
            source.start(startTime, sourceOffset, sourceSpan);
          } catch (err) {
            // A clip with no decodable audio track (silent video, corrupt asset, etc.) shouldn't
            // abort the whole mixdown — just leave it silent.
            console.warn(`NyxVideo: skipping audio for "${asset.name}" during export mixdown`, err);
          }
        })(),
      );
    }
  }

  await Promise.all(jobs);
  return offlineCtx.startRendering();
}
