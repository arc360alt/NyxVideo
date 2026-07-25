import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { projectDuration } from '../lib/time';

/** Drives the timeline clock forward with requestAnimationFrame while playing. */
export function usePlaybackClock() {
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    function tick(ts: number) {
      try {
        const { isPlaying, currentTime, project, setCurrentTime, setPlaying } = useProjectStore.getState();
        if (isPlaying) {
          const last = lastTsRef.current ?? ts;
          const dt = (ts - last) / 1000;
          lastTsRef.current = ts;
          const duration = projectDuration(project);
          let next = currentTime + dt;
          if (duration > 0 && next >= duration) {
            next = 0;
            setPlaying(false);
          }
          setCurrentTime(next);
        } else {
          lastTsRef.current = null;
        }
      } catch (err) {
        // A single bad frame (e.g. a media element rejecting a property write) must never permanently
        // kill the clock — without this catch, the throw would skip the requestAnimationFrame call
        // below and playback would be stuck until a full page reload.
        console.error('NyxVideo: playback tick failed, continuing', err);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
