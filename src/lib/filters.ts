import type { EffectParams } from '../types';
import { DEFAULT_EFFECTS } from '../types';

/** Builds a canvas/CSS `filter` string from effect params (vignette is drawn separately). */
export function buildFilterString(fx: EffectParams): string {
  const parts: string[] = [];
  if (fx.brightness !== 100) parts.push(`brightness(${fx.brightness}%)`);
  if (fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
  if (fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`);
  if (fx.grayscale > 0) parts.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia > 0) parts.push(`sepia(${fx.sepia}%)`);
  if (fx.invert > 0) parts.push(`invert(${fx.invert}%)`);
  if (fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
  if (fx.hueRotate > 0) parts.push(`hue-rotate(${fx.hueRotate}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export interface EffectPresetDef {
  id: string;
  name: string;
  params: Partial<EffectParams>;
}

export const EFFECT_PRESETS: EffectPresetDef[] = [
  { id: 'none', name: 'None', params: {} },
  { id: 'bw', name: 'Black & White', params: { grayscale: 100 } },
  { id: 'sepia', name: 'Sepia Tone', params: { sepia: 80 } },
  { id: 'vintage', name: 'Vintage', params: { sepia: 40, contrast: 110, saturation: 80, vignette: 40 } },
  { id: 'vivid', name: 'Vivid', params: { saturation: 160, contrast: 115 } },
  { id: 'cold', name: 'Cold', params: { hueRotate: 190, saturation: 110 } },
  { id: 'warm', name: 'Warm', params: { hueRotate: 15, saturation: 120, brightness: 105 } },
  { id: 'dream', name: 'Dreamy', params: { blur: 1.5, brightness: 112, saturation: 90 } },
  { id: 'noir', name: 'Noir', params: { grayscale: 100, contrast: 140, vignette: 60 } },
  { id: 'invert', name: 'Inverted', params: { invert: 100 } },
  { id: 'soft', name: 'Soft Blur', params: { blur: 3 } },
  { id: 'night', name: 'Night Vision', params: { hueRotate: 90, saturation: 200, contrast: 130, brightness: 90 } },
];

export function applyPreset(base: EffectParams, preset: EffectPresetDef): EffectParams {
  return { ...DEFAULT_EFFECTS, ...base, ...preset.params };
}
