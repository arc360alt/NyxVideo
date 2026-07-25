import type { Clip, MediaAsset, MediaClip, Project, ShapeClip, TextClip, Transform } from '../types';
import { isClipActive, computeFadeMultiplier } from './clipUtils';
import { buildFilterString } from './filters';
import { buildShapePath, isStrokeOnlyShape } from './shapes';
import { resolveTransform } from './keyframes';
import { renderTransition } from './transitions';
import type { CompositionEngine } from './engine';

function applyTransform(ctx: CanvasRenderingContext2D, t: Transform) {
  ctx.translate(t.x, t.y);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  // Compose with (rather than overwrite) any alpha already set by a caller — e.g.
  // a transition blend sets globalAlpha before drawing a clip through this path.
  ctx.globalAlpha = ctx.globalAlpha * Math.max(0, Math.min(1, t.opacity / 100));
}

function drawVignette(ctx: CanvasRenderingContext2D, t: Transform, amount: number) {
  if (amount <= 0) return;
  const w = t.width;
  const h = t.height;
  const grad = ctx.createRadialGradient(0, 0, Math.min(w, h) * 0.2, 0, 0, Math.max(w, h) * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, amount / 100)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(-w / 2, -h / 2, w, h);
}

function drawMediaClip(
  ctx: CanvasRenderingContext2D,
  clip: MediaClip,
  transform: Transform,
  engine: CompositionEngine,
  asset: MediaAsset,
) {
  const t = transform;
  ctx.save();
  applyTransform(ctx, t);
  ctx.filter = buildFilterString(clip.effects);

  if (clip.kind === 'video') {
    const el = engine.getVideoElement(asset);
    engine.drawVideoFrame(ctx, el, -t.width / 2, -t.height / 2, t.width, t.height);
  } else if (clip.kind === 'image') {
    const el = engine.getImageElement(asset);
    if (el.complete && el.naturalWidth > 0) {
      ctx.drawImage(el, -t.width / 2, -t.height / 2, t.width, t.height);
    }
  }
  ctx.filter = 'none';
  drawVignette(ctx, t, clip.effects.vignette);
  ctx.restore();
}

function drawShapeClip(ctx: CanvasRenderingContext2D, clip: ShapeClip, transform: Transform) {
  const t = transform;
  ctx.save();
  applyTransform(ctx, t);
  const path = buildShapePath(clip.shapeType, t.width, t.height);
  if (!isStrokeOnlyShape(clip.shapeType) && clip.style.fill !== 'none') {
    ctx.fillStyle = clip.style.fill;
    ctx.fill(path);
  }
  if (clip.style.strokeWidth > 0) {
    ctx.strokeStyle = clip.style.stroke;
    ctx.lineWidth = clip.style.strokeWidth;
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawTextClip(ctx: CanvasRenderingContext2D, clip: TextClip, transform: Transform) {
  const t = transform;
  ctx.save();
  applyTransform(ctx, t);
  const weight = clip.bold ? 'bold' : 'normal';
  const style = clip.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${clip.fontSize}px ${clip.fontFamily}`;
  ctx.textAlign = clip.align;
  ctx.textBaseline = 'middle';
  const lines = clip.text.split('\n');
  const lineHeight = clip.fontSize * 1.25;
  const totalHeight = lineHeight * lines.length;
  const startY = -totalHeight / 2 + lineHeight / 2;
  const alignX = clip.align === 'left' ? -t.width / 2 : clip.align === 'right' ? t.width / 2 : 0;

  if (clip.backgroundColor) {
    const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const padX = clip.fontSize * 0.5;
    const padY = clip.fontSize * 0.3;
    const boxW = maxLineWidth + padX * 2;
    const boxH = totalHeight + padY * 2;
    ctx.fillStyle = clip.backgroundColor;
    const r = Math.min(10, boxH / 4);
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, r);
    ctx.fill();
  }

  ctx.fillStyle = clip.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, alignX, startY + i * lineHeight);
  });
  ctx.restore();
}

function mediaElementSize(clip: MediaClip, engine: CompositionEngine, asset: MediaAsset): [number, number] | null {
  if (clip.kind === 'video') {
    const el = engine.getVideoElement(asset);
    if (el.readyState >= 2 && el.videoWidth) return [el.videoWidth, el.videoHeight];
    return engine.getCachedFrameSize(el);
  }
  const el = engine.getImageElement(asset);
  if (!el.complete || !el.naturalWidth) return null;
  return [el.naturalWidth, el.naturalHeight];
}

function drawBlurredBackground(
  ctx: CanvasRenderingContext2D,
  project: Project,
  engine: CompositionEngine,
  t: number,
  assetById: Map<string, MediaAsset>,
): boolean {
  for (const track of project.tracks) {
    if (track.kind !== 'video' || track.hidden) continue;
    const clip = track.clips.find((c) => isClipActive(c, t) && (c.kind === 'video' || c.kind === 'image')) as
      | MediaClip
      | undefined;
    if (!clip) continue;
    const asset = assetById.get(clip.assetId);
    if (!asset) continue;
    const size = mediaElementSize(clip, engine, asset);
    if (!size) continue;
    const [srcW, srcH] = size;
    const scale = Math.max(project.width / srcW, project.height / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.save();
    ctx.filter = 'blur(48px) brightness(0.55)';
    const dx = (project.width - dw) / 2;
    const dy = (project.height - dh) / 2;
    if (clip.kind === 'video') {
      engine.drawVideoFrame(ctx, engine.getVideoElement(asset), dx, dy, dw, dh);
    } else {
      ctx.drawImage(engine.getImageElement(asset), dx, dy, dw, dh);
    }
    ctx.filter = 'none';
    ctx.restore();
    return true;
  }
  return false;
}

export interface DrawOptions {
  selectedClipId?: string | null;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  engine: CompositionEngine,
  project: Project,
  t: number,
  opts: DrawOptions = {},
) {
  const { width, height } = project;
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const assetById = new Map(project.assets.map((a) => [a.id, a]));

  ctx.fillStyle = project.background.mode === 'color' ? project.background.color : '#000000';
  ctx.fillRect(0, 0, width, height);
  if (project.background.mode === 'blur') {
    drawBlurredBackground(ctx, project, engine, t, assetById);
  }

  let selectedClip: Clip | null = null;
  let selectedTransform: Transform | null = null;

  const drawSingleClip = (clip: Clip) => {
    const localTime = t - clip.start;
    const baseTransform = 'transform' in clip ? resolveTransform(clip, localTime) : null;
    // Fade in/out is a render-time-only effect layered on top of the authored opacity — applied
    // here rather than inside resolveTransform so the Inspector still shows the clip's actual
    // authored opacity instead of a value that jumps around as the playhead crosses a fade window.
    const fadeMultiplier = computeFadeMultiplier(clip, localTime);
    const transform = baseTransform && fadeMultiplier < 1 ? { ...baseTransform, opacity: baseTransform.opacity * fadeMultiplier } : baseTransform;
    if (clip.id === opts.selectedClipId) {
      selectedClip = clip;
      selectedTransform = transform;
    }
    if (!transform) return;
    if (clip.kind === 'video' || clip.kind === 'image') {
      const asset = assetById.get((clip as MediaClip).assetId);
      if (asset) drawMediaClip(ctx, clip as MediaClip, transform, engine, asset);
    } else if (clip.kind === 'shape') {
      drawShapeClip(ctx, clip as ShapeClip, transform);
    } else if (clip.kind === 'text') {
      drawTextClip(ctx, clip as TextClip, transform);
    }
  };

  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i];
    if (track.kind !== 'video' || track.hidden) continue;
    const activeClips = track.clips.filter((clip) => isClipActive(clip, t));
    if (activeClips.length === 0) continue;

    if (activeClips.length >= 2) {
      const transition = project.transitions.find(
        (tr) =>
          tr.trackId === track.id &&
          activeClips.some((c) => c.id === tr.fromClipId) &&
          activeClips.some((c) => c.id === tr.toClipId),
      );
      if (transition) {
        const fromClip = activeClips.find((c) => c.id === transition.fromClipId)!;
        const toClip = activeClips.find((c) => c.id === transition.toClipId)!;
        const progress = Math.max(0, Math.min(1, (t - toClip.start) / transition.duration));
        renderTransition(ctx, transition.type, progress, width, height, () => drawSingleClip(fromClip), () => drawSingleClip(toClip));
        for (const clip of activeClips) {
          if (clip.id !== fromClip.id && clip.id !== toClip.id) drawSingleClip(clip);
        }
        continue;
      }
    }
    for (const clip of activeClips) drawSingleClip(clip);
  }

  if (selectedClip && selectedTransform) {
    drawSelectionOutline(ctx, selectedTransform);
  }

  ctx.restore();
}

export const HANDLE_SIZE = 14;

export function drawSelectionOutline(ctx: CanvasRenderingContext2D, t: Transform) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(-t.width / 2, -t.height / 2, t.width, t.height);
  ctx.setLineDash([]);

  const half = HANDLE_SIZE / 2;
  ctx.fillStyle = '#a78bfa';
  const corners: [number, number][] = [
    [-t.width / 2, -t.height / 2],
    [t.width / 2, -t.height / 2],
    [-t.width / 2, t.height / 2],
    [t.width / 2, t.height / 2],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx - half, cy - half, HANDLE_SIZE, HANDLE_SIZE);
  }

  // rotate handle
  ctx.beginPath();
  ctx.moveTo(0, -t.height / 2);
  ctx.lineTo(0, -t.height / 2 - 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -t.height / 2 - 28, half, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
