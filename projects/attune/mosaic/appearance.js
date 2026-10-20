import { area } from './mosaic.js';

export const VIEW_SIZE = 432;
export const DEFAULT_SETTINGS = Object.freeze({ gap: 3.5, texture: 30, shadow: 1, motion: 1, finish: 'frosted', darkMode: false, width: 760 });
export const finishOf = settings => settings.finish === 'glass' ? 'glass' : 'frosted';
export const VISUAL_KEY = 'attune.mosaic-appearance.v2';
export const pointsString = points => points.map(p => p.join(',')).join(' ');
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
export const center = points => points.reduce((c, p) => [c[0] + p[0] / points.length, c[1] + p[1] / points.length], [0, 0]);
export function contains(points, p) { return points.every((a, i) => cross(a, points[(i + 1) % points.length], p) >= -1e-7); }
export function minWidth(points) {
  if (points.length < 3) return 0;
  let width = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const values = points.map(p => cross(a, b, p) / length);
    width = Math.min(width, Math.max(...values) - Math.min(...values));
  }
  return width;
}
export function isSeamEdge(a, b, seam) {
  if (!seam) return false;
  const length = Math.hypot(seam[1][0] - seam[0][0], seam[1][1] - seam[0][1]);
  return Math.abs(cross(seam[0], seam[1], a)) / length < 1e-6 && Math.abs(cross(seam[0], seam[1], b)) / length < 1e-6;
}
// Intersect shifted supporting half-planes. This is a true constant-distance inset.
// Optional seamDistance lets a new seam open without moving existing seams.
export function insetPolygon(points, distance, seam = null, seamDistance = distance) {
  let result = points.map(p => [...p]);
  for (let i = 0; i < points.length && result.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const d = isSeamEdge(a, b, seam) ? seamDistance : distance;
    const side = p => cross(a, b, p) / length - d;
    const input = result; result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) result.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        const t = sp / (sp - sq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    result = result.filter((p, j) => { const q = result[(j + 1) % result.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-8; });
  }
  return result;
}
export function renderLayout(pieces, width, gap) {
  const unit = VIEW_SIZE / Math.max(1, width), target = gap * unit / 2;
  const safe = d => pieces.every(p => {
    const inset = insetPolygon(p.points, d);
    return inset.length >= 3 && area(inset) >= area(p.points) * .25 && minWidth(inset) >= Math.min(8 * unit, minWidth(p.points) * .55) - 1e-7;
  });
  let distance = target;
  if (!safe(target)) {
    let low = 0, high = target;
    for (let i = 0; i < 32; i++) { const mid = (low + high) / 2; if (safe(mid)) low = mid; else high = mid; }
    distance = low;
  }
  return { unit, distance, gap: distance * 2 / unit, polygons: new Map(pieces.map(p => [p.activity.id, insetPolygon(p.points, distance)])) };
}
export function sharedSeam(a, b) {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length];
    if (Math.hypot(p[0] - s[0], p[1] - s[1]) < 1e-6 && Math.hypot(q[0] - r[0], q[1] - r[1]) < 1e-6) return [p, q];
  }
  return null;
}
export function transitionPair(before, after) {
  const undo = before.length === after.length + 1;
  if (!undo && after.length !== before.length + 1) return null;
  const small = undo ? after : before, large = undo ? before : after;
  const newPiece = large.find(p => !small.some(q => q.activity.id === p.activity.id));
  const original = small.find(p => { const q = large.find(t => t.activity.id === p.activity.id); return q && pointsString(p.points) !== pointsString(q.points); });
  if (!original || !newPiece) return null;
  const retained = large.find(p => p.activity.id === original.activity.id);
  const seam = sharedSeam(retained.points, newPiece.points);
  return seam ? { undo, original, children: [retained, newPiece], seam } : null;
}
export function transitionPolygons(pair, distance, phase) {
  const parent = insetPolygon(pair.original.points, distance);
  const [a, b] = pair.seam, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return pair.children.map(child => {
    const sign = Math.sign(cross(a, b, center(child.points)));
    const side = p => sign * cross(a, b, p) / length - distance * phase;
    const result = [];
    for (let i = 0; i < parent.length; i++) {
      const p = parent[i], q = parent[(i + 1) % parent.length], sp = side(p), sq = side(q);
      if (sp >= 0) result.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { const t = sp / (sp - sq); result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    return result;
  });
}
export function mixColor(a, b, t) {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const from = rgb(a), to = rgb(b);
  return '#' + from.map((v, i) => Math.round(v + (to[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('');
}
export function parseSettings(raw) {
  let value; try { value = JSON.parse(raw); } catch { value = {}; }
  const ranges = { gap: [1, 8], texture: [0, 100], shadow: [0, 2], motion: [0, 2], width: [350, 1100] };
  const result = { ...DEFAULT_SETTINGS };
  for (const [key, [low, high]] of Object.entries(ranges)) if (Number.isFinite(value?.[key])) result[key] = Math.max(low, Math.min(high, value[key]));
  // Legacy Flat settings become Frosted; obsolete icon and flat flags are dropped.
  result.finish = finishOf(value || {});
  if (typeof value?.darkMode === 'boolean') result.darkMode = value.darkMode;
  return result;
}

// Pure gesture state; movement cancels tapping without preventing native scrolling.
export class PressGesture {
  constructor() { this.active = null; }
  start(id, pointerId, x, y) { this.active = { id, pointerId, x, y }; }
  move(pointerId, x, y) { if (this.active?.pointerId === pointerId && Math.hypot(x - this.active.x, y - this.active.y) > 7) { this.active = null; return true; } return false; }
  release(pointerId, inside) { if (this.active?.pointerId !== pointerId) return null; const id = inside ? this.active.id : null; this.active = null; return id; }
  cancel() { this.active = null; }
}
