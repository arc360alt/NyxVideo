import type { ShapeType } from '../types';

export interface ShapeDef {
  type: ShapeType;
  label: string;
}

export const SHAPE_LIBRARY: ShapeDef[] = [
  { type: 'rect', label: 'Rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'star', label: 'Star' },
  { type: 'pentagon', label: 'Pentagon' },
  { type: 'hexagon', label: 'Hexagon' },
  { type: 'line', label: 'Line' },
  { type: 'arrow', label: 'Arrow' },
];

function regularPolygonPoints(sides: number, w: number, h: number, rotationOffset = -Math.PI / 2): [number, number][] {
  const rx = w / 2;
  const ry = h / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotationOffset + (i * 2 * Math.PI) / sides;
    pts.push([Math.cos(angle) * rx, Math.sin(angle) * ry]);
  }
  return pts;
}

function starPoints(w: number, h: number, spikes = 5): [number, number][] {
  const outerRx = w / 2;
  const outerRy = h / 2;
  const innerRx = outerRx * 0.42;
  const innerRy = outerRy * 0.42;
  const pts: [number, number][] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    const rx = i % 2 === 0 ? outerRx : innerRx;
    const ry = i % 2 === 0 ? outerRy : innerRy;
    pts.push([Math.cos(angle) * rx, Math.sin(angle) * ry]);
  }
  return pts;
}

/** Builds a Path2D for the given shape, centered at (0,0), spanning `w` x `h`. */
export function buildShapePath(type: ShapeType, w: number, h: number): Path2D {
  const path = new Path2D();
  switch (type) {
    case 'rect': {
      path.rect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'ellipse': {
      path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    }
    case 'triangle': {
      const pts = regularPolygonPoints(3, w, h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
      break;
    }
    case 'pentagon': {
      const pts = regularPolygonPoints(5, w, h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
      break;
    }
    case 'hexagon': {
      const pts = regularPolygonPoints(6, w, h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
      break;
    }
    case 'star': {
      const pts = starPoints(w, h);
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
      path.closePath();
      break;
    }
    case 'line': {
      path.moveTo(-w / 2, 0);
      path.lineTo(w / 2, 0);
      break;
    }
    case 'arrow': {
      const headSize = Math.min(h, w * 0.3);
      const shaftHalf = headSize * 0.18;
      const shaftEnd = w / 2 - headSize;
      path.moveTo(-w / 2, -shaftHalf);
      path.lineTo(shaftEnd, -shaftHalf);
      path.lineTo(shaftEnd, -headSize / 2);
      path.lineTo(w / 2, 0);
      path.lineTo(shaftEnd, headSize / 2);
      path.lineTo(shaftEnd, shaftHalf);
      path.lineTo(-w / 2, shaftHalf);
      path.closePath();
      break;
    }
  }
  return path;
}

export function isStrokeOnlyShape(type: ShapeType): boolean {
  return type === 'line' || type === 'arrow';
}
