// Core data model for the NyxVideo editor.

export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string; // object URL
  duration: number; // seconds; 0 for images
  width: number;
  height: number;
  thumbnail?: string; // data URL
  /** true for assets generated in-app (e.g. sound effects), false for user uploads */
  builtin?: boolean;
  /** credit line for third-party sourced audio, shown wherever the asset is listed */
  attribution?: string;
  /** true when this asset's media data isn't available locally and needs to be relinked (after a .nv import) */
  missing?: boolean;
  /** original uploaded filename, kept for relink matching when media wasn't embedded on export */
  sourceFileName?: string;
}

export interface EffectParams {
  brightness: number; // % 0-300, 100 = normal
  contrast: number; // % 0-300
  saturation: number; // % 0-300
  grayscale: number; // % 0-100
  sepia: number; // % 0-100
  invert: number; // % 0-100
  blur: number; // px 0-40
  hueRotate: number; // deg 0-360
  vignette: number; // % 0-100 (custom, drawn manually)
}

export const DEFAULT_EFFECTS: EffectParams = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blur: 0,
  hueRotate: 0,
  vignette: 0,
};

export interface EffectPreset {
  id: string;
  name: string;
  params: Partial<EffectParams>;
}

export interface Transform {
  x: number; // center x in project px space
  y: number; // center y in project px space
  width: number; // display width in project px space
  height: number; // display height in project px space
  rotation: number; // degrees
  opacity: number; // 0-100
}

export const DEFAULT_TRANSFORM = (w: number, h: number, x: number, y: number): Transform => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
  opacity: 100,
});

export type ShapeType =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'pentagon'
  | 'hexagon'
  | 'line'
  | 'arrow';

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type ClipKind = 'video' | 'audio' | 'image' | 'shape' | 'text';

/** Transform/opacity properties that can be animated with keyframes. */
export type KeyframeProp = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity';

export interface Keyframe {
  /** time in seconds, relative to the clip's own start */
  time: number;
  value: number;
}

export type KeyframeSet = Partial<Record<KeyframeProp, Keyframe[]>>;

interface BaseClip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  start: number; // timeline start, seconds
  duration: number; // timeline duration, seconds
  /** per-property animation curves, keyed by clip-relative time */
  keyframes?: KeyframeSet;
  /** marks a clip as a frozen-frame still, for icon/labeling purposes */
  isFreezeFrame?: boolean;
  /** seconds to ramp in from transparent (and, for media clips, silent) at the start of the clip */
  fadeIn?: number;
  /** seconds to ramp out to transparent (and, for media clips, silent) at the end of the clip — the "fade to black" a clip needs no partner to do */
  fadeOut?: number;
}

export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // hex, the color to key out
  similarity: number; // 0-100, how close a pixel's chroma needs to be to the key color to be removed
  smoothness: number; // 0-100, width of the soft edge between kept and removed
  spill: number; // 0-100, how strongly to desaturate the key color's cast on remaining edge pixels
}

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: false,
  color: '#00ff00',
  similarity: 40,
  smoothness: 15,
  spill: 50,
};

export interface MediaClip extends BaseClip {
  kind: 'video' | 'audio' | 'image';
  assetId: string;
  sourceIn: number; // in-point within source asset, seconds
  volume: number; // 0-200 %
  muted: boolean;
  /** playback speed multiplier; source time consumed per timeline second (1 = normal, 2 = 2x, 0.5 = half speed) */
  speed: number;
  /** when true, browser compensates pitch shift caused by non-1 speed (time-stretch); when false, pitch shifts naturally with speed */
  preservePitch: boolean;
  /** green/blue-screen removal — only meaningful for video/image kind, absent or enabled:false means no keying */
  chromaKey?: ChromaKeySettings;
  transform: Transform;
  effects: EffectParams;
}

export interface ShapeClip extends BaseClip {
  kind: 'shape';
  shapeType: ShapeType;
  style: ShapeStyle;
  transform: Transform;
}

export interface TextClip extends BaseClip {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  /** optional backdrop rectangle behind the text block, e.g. 'rgba(0,0,0,0.6)'; unset = no background */
  backgroundColor?: string;
  transform: Transform;
  /** marks a clip as an auto-generated caption, for icon/labeling purposes */
  isCaption?: boolean;
}

export type Clip = MediaClip | ShapeClip | TextClip;

export type TrackKind = 'video' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface ProjectBackground {
  /** 'color' fills empty space with a solid color; 'blur' fills it with a scaled, blurred copy of the frame content */
  mode: 'color' | 'blur';
  color: string;
}

export const DEFAULT_BACKGROUND: ProjectBackground = { mode: 'color', color: '#000000' };

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export type TransitionType =
  | 'crossfade'
  | 'fade-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'iris';

export interface Transition {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number; // seconds, the overlap between the two clips
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  background: ProjectBackground;
  markers: Marker[];
  transitions: Transition[];
  tracks: Track[]; // index 0 = bottom-most (rendered first)
  assets: MediaAsset[];
}

export function isMediaClip(c: Clip): c is MediaClip {
  return c.kind === 'video' || c.kind === 'audio' || c.kind === 'image';
}
export function isShapeClip(c: Clip): c is ShapeClip {
  return c.kind === 'shape';
}
export function isTextClip(c: Clip): c is TextClip {
  return c.kind === 'text';
}
export function isVisualClip(c: Clip): boolean {
  return c.kind !== 'audio';
}
