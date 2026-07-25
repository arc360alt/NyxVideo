import { useProjectStore } from '../../store/useProjectStore';
import { EFFECT_PRESETS, applyPreset, buildFilterString } from '../../lib/filters';
import { DEFAULT_EFFECTS } from '../../types';
import type { MediaClip } from '../../types';

const SLIDERS: { key: keyof typeof DEFAULT_EFFECTS; label: string; min: number; max: number; step: number }[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 300, step: 1 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 300, step: 1 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 300, step: 1 },
  { key: 'hueRotate', label: 'Hue Rotate', min: 0, max: 360, step: 1 },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1 },
  { key: 'invert', label: 'Invert', min: 0, max: 100, step: 1 },
  { key: 'blur', label: 'Blur', min: 0, max: 40, step: 0.5 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 1 },
];

export function EffectsTab() {
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const clip = useProjectStore((s) =>
    s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selectedClipId),
  );
  const updateEffects = useProjectStore((s) => s.updateEffects);

  const isVisualMedia = clip && (clip.kind === 'video' || clip.kind === 'image');
  const mediaClip = isVisualMedia ? (clip as MediaClip) : null;

  return (
    <div className="nyx-scroll flex h-full flex-col gap-4 overflow-y-auto p-3">
      {!selectedClipId && (
        <div className="mt-6 text-center text-xs text-fg-faint">
          Select a video or image clip on the timeline to apply effects.
        </div>
      )}
      {selectedClipId && !mediaClip && (
        <div className="mt-6 text-center text-xs text-fg-faint">
          Effects apply to video and image clips only.
        </div>
      )}

      {mediaClip && (
        <>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">Presets</div>
            <div className="grid grid-cols-3 gap-2">
              {EFFECT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => updateEffects(mediaClip.id, applyPreset(DEFAULT_EFFECTS, preset))}
                  className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-1 p-1.5 hover:border-violet-500"
                >
                  <div
                    className="h-8 w-full rounded bg-gradient-to-br from-zinc-500 to-zinc-700"
                    style={{ filter: buildFilterString({ ...DEFAULT_EFFECTS, ...preset.params }) }}
                  />
                  <span className="text-[10px] text-fg-subtle">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-faint">
              <span>Adjust</span>
              <button
                className="normal-case text-violet-400 hover:text-violet-300"
                onClick={() => updateEffects(mediaClip.id, DEFAULT_EFFECTS)}
              >
                Reset
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {SLIDERS.map((s) => (
                <label key={s.key} className="flex flex-col gap-1 text-xs text-fg-subtle">
                  <span className="flex justify-between">
                    <span>{s.label}</span>
                    <span className="text-fg-faint">{mediaClip.effects[s.key]}</span>
                  </span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={mediaClip.effects[s.key]}
                    onChange={(e) => updateEffects(mediaClip.id, { [s.key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
