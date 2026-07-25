import { useState } from 'react';
import { SOUND_EFFECTS, renderAndCacheSfx } from '../../lib/soundEffects';
import { useProjectStore } from '../../store/useProjectStore';
import { FiPause, FiPlay, FiPlus } from 'react-icons/fi';

const CATEGORIES = Array.from(new Set(SOUND_EFFECTS.map((s) => s.category)));

export function SoundsTab() {
  const addSoundEffectToTimeline = useProjectStore((s) => s.addSoundEffectToTimeline);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const togglePreview = async (id: string) => {
    if (playingId === id) {
      audioEl?.pause();
      setPlayingId(null);
      return;
    }
    audioEl?.pause();
    setBusyId(id);
    try {
      const { url } = await renderAndCacheSfx(id);
      const el = new Audio(url);
      el.onended = () => setPlayingId(null);
      await el.play();
      setAudioEl(el);
      setPlayingId(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="nyx-scroll flex h-full flex-col gap-4 overflow-y-auto p-3">
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">{cat}</div>
          <div className="flex flex-col gap-1.5">
            {SOUND_EFFECTS.filter((s) => s.category === cat).map((sfx) => (
              <div
                key={sfx.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/x-nyx-sfx', sfx.id)}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-2 py-1.5"
              >
                <button
                  onClick={() => togglePreview(sfx.id)}
                  disabled={busyId === sfx.id}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg hover:bg-violet-600 disabled:opacity-50"
                >
                  {playingId === sfx.id ? <FiPause size={12} /> : <FiPlay size={12} />}
                </button>
                <span className="flex-1 truncate text-xs text-fg-muted">{sfx.name}</span>
                <span className="text-[10px] text-fg-faint">{sfx.duration.toFixed(1)}s</span>
                <button
                  onClick={() => addSoundEffectToTimeline(sfx.id)}
                  title="Add to timeline"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-2 text-fg hover:bg-violet-600"
                >
                  <FiPlus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
