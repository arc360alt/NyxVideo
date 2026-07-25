import type { TransitionType } from '../types';

export interface TransitionDef {
  type: TransitionType;
  name: string;
}

export const TRANSITION_LIBRARY: TransitionDef[] = [
  { type: 'crossfade', name: 'Crossfade' },
  { type: 'fade-black', name: 'Fade to Black' },
  { type: 'fade-white', name: 'Fade to White' },
  { type: 'wipe-left', name: 'Wipe Left' },
  { type: 'wipe-right', name: 'Wipe Right' },
  { type: 'wipe-up', name: 'Wipe Up' },
  { type: 'wipe-down', name: 'Wipe Down' },
  { type: 'slide-left', name: 'Slide Left' },
  { type: 'slide-right', name: 'Slide Right' },
  { type: 'zoom-in', name: 'Zoom In' },
  { type: 'zoom-out', name: 'Zoom Out' },
  { type: 'iris', name: 'Iris' },
];

/**
 * Renders the blend between clip A (outgoing) and clip B (incoming) at `progress` (0 = fully A, 1 = fully B).
 * `drawA`/`drawB` paint one full clip's content into the current canvas state (already save()'d by the caller).
 */
export function renderTransition(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  progress: number,
  width: number,
  height: number,
  drawA: () => void,
  drawB: () => void,
) {
  const p = Math.max(0, Math.min(1, progress));

  switch (type) {
    case 'crossfade': {
      drawA();
      ctx.save();
      ctx.globalAlpha = p;
      drawB();
      ctx.restore();
      break;
    }
    case 'fade-black':
    case 'fade-white': {
      const color = type === 'fade-black' ? '#000000' : '#ffffff';
      if (p < 0.5) {
        drawA();
        ctx.save();
        ctx.globalAlpha = p / 0.5;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = (p - 0.5) / 0.5;
        drawB();
        ctx.restore();
      }
      break;
    }
    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down': {
      drawA();
      ctx.save();
      ctx.beginPath();
      if (type === 'wipe-left') ctx.rect(width * (1 - p), 0, width * p, height);
      else if (type === 'wipe-right') ctx.rect(0, 0, width * p, height);
      else if (type === 'wipe-up') ctx.rect(0, height * (1 - p), width, height * p);
      else ctx.rect(0, 0, width, height * p);
      ctx.clip();
      drawB();
      ctx.restore();
      break;
    }
    case 'slide-left':
    case 'slide-right': {
      const dir = type === 'slide-left' ? -1 : 1;
      ctx.save();
      ctx.translate(dir * width * p, 0);
      drawA();
      ctx.restore();

      ctx.save();
      ctx.translate(dir * width * (p - 1), 0);
      drawB();
      ctx.restore();
      break;
    }
    case 'zoom-in': {
      drawA();
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(width / 2, height / 2);
      ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
      ctx.translate(-width / 2, -height / 2);
      drawB();
      ctx.restore();
      break;
    }
    case 'zoom-out': {
      drawA();
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(width / 2, height / 2);
      ctx.scale(1.6 - 0.6 * p, 1.6 - 0.6 * p);
      ctx.translate(-width / 2, -height / 2);
      drawB();
      ctx.restore();
      break;
    }
    case 'iris': {
      drawA();
      const maxRadius = Math.hypot(width / 2, height / 2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, maxRadius * p, 0, Math.PI * 2);
      ctx.clip();
      drawB();
      ctx.restore();
      break;
    }
  }
}
