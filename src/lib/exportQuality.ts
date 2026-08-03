import { QUALITY_VERY_LOW, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, QUALITY_VERY_HIGH, type Quality } from 'mediabunny';

export type ExportQuality = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export const EXPORT_QUALITY_LABELS: Record<ExportQuality, string> = {
  'very-low': 'Very Low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  'very-high': 'Very High',
};

/** mediabunny scales bitrate for these by resolution automatically, so the same preset is sane at any export size. */
export function qualityToMediabunny(quality: ExportQuality): Quality {
  switch (quality) {
    case 'very-low':
      return QUALITY_VERY_LOW;
    case 'low':
      return QUALITY_LOW;
    case 'medium':
      return QUALITY_MEDIUM;
    case 'very-high':
      return QUALITY_VERY_HIGH;
    case 'high':
    default:
      return QUALITY_HIGH;
  }
}

// Roughly the same perceptual targets as mediabunny's own Quality presets, at 1080p — scaled by
// actual pixel count below. Only used by the real-time MediaRecorder fallback path (for browsers
// without WebCodecs), since MediaRecorder wants a plain bits-per-second number, not a Quality object.
const BASE_BITRATE_AT_1080P: Record<ExportQuality, number> = {
  'very-low': 1_500_000,
  low: 3_000_000,
  medium: 6_000_000,
  high: 10_000_000,
  'very-high': 20_000_000,
};

export function qualityToBitrate(quality: ExportQuality, width: number, height: number): number {
  const scale = (width * height) / (1920 * 1080);
  return Math.round(BASE_BITRATE_AT_1080P[quality] * Math.max(0.15, scale));
}

/** Common resolution presets, named by height like most video platforms — filtered to the project's own size and below in the UI. */
export const RESOLUTION_PRESETS = [2160, 1440, 1080, 720, 480, 360] as const;

/**
 * Resolves a target export height (or null for "use the project's own resolution") into actual
 * output pixel dimensions, preserving the project's aspect ratio and rounding to even numbers —
 * most video codecs require even width/height.
 */
export function computeExportResolution(
  projectWidth: number,
  projectHeight: number,
  targetHeight: number | null,
): { width: number; height: number } {
  if (!targetHeight || targetHeight >= projectHeight) {
    return { width: projectWidth, height: projectHeight };
  }
  const scale = targetHeight / projectHeight;
  const width = Math.max(2, Math.round((projectWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round(targetHeight / 2) * 2);
  return { width, height };
}
