import { center } from './appearance.js';

// Round only the rendered contour. Straight edges retain their true inset.
// Circular fillets give acute tips the same physical softness as broad corners.
// Bounded cutbacks leave at least 52% of every straight edge intact.
export function roundedContour(points, radius, cornerScale = () => 1) {
  if (points.length < 3) return { path: '', edges: [], corners: [] };
  const corners = points.map((p, i) => {
    const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const a = Math.hypot(prev[0] - p[0], prev[1] - p[1]), b = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const straight = { p, before: [...p], after: [...p], radius: 0, center: [...p] };
    if (a < 1e-8 || b < 1e-8) return straight;
    const u = prev.map((v, axis) => (v - p[axis]) / a), v = next.map((v, axis) => (v - p[axis]) / b);
    const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const sinHalf = Math.sqrt((1 - dot) / 2), cosHalf = Math.sqrt((1 + dot) / 2);
    if (sinHalf < 1e-6 || cosHalf < 1e-6) return straight;
    const cut = Math.max(0, Math.min(radius * cornerScale(p) * cosHalf / sinHalf, a * .24, b * .24));
    if (cut < 1e-8) return straight;
    const effectiveRadius = cut * sinHalf / cosHalf;
    const along = (q, length) => length ? p.map((v, axis) => v + (q[axis] - v) * cut / length) : [...p];
    return { p, before: along(prev, a), after: along(next, b), radius: effectiveRadius, center: p.map((value, axis) => value + (u[axis] + v[axis]) * cut / (2 * cosHalf ** 2)) };
  });
  let path = `M${corners[0].after}`;
  for (let i = 1; i <= corners.length; i++) {
    const c = corners[i % corners.length];
    path += `L${c.before}`;
    if (c.radius > 0) path += `A${c.radius},${c.radius} 0 0 1 ${c.after}`;
  }
  return { path: path + 'Z', edges: corners.map((c, i) => [c.after, corners[(i + 1) % corners.length].before]), corners };
}

// Appearance belongs to the activity, not a render or a polygon. Stable hashes
// preserve each piece's frosting through resize, reload, split, and exact undo.
export function frostProfile(activityId) {
  let seed = (Number(activityId) ^ 0x9e3779b9) >>> 0;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
    seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97);
    return ((seed ^= seed >>> 15) >>> 0) / 4294967296;
  };
  return { x: .16 + random() * .12, y: .05 + random() * .12, spreadX: .86 + random() * .18, spreadY: .70 + random() * .16, shoulder: .36 + random() * .12, grainX: random() * 64, grainY: random() * 64, grainAngle: -12 + random() * 24 };
}

export function blendFrost(parent, child, phase) {
  if (phase <= 0) return parent;
  if (phase >= 1) return child;
  return Object.fromEntries(Object.keys(parent).map(key => [key, parent[key] + (child[key] - parent[key]) * phase]));
}

// Project a genuinely tilted plane back into SVG, keeping native hit polygons
// stationary. CSS-pixel units keep lift and perspective consistent at any size.
export function projectTile(points, unit, amount) {
  return points.map(tileProjection(points, unit, amount));
}

// Also projects glyph anchors against the same plane as the tile surface.
export function tileProjection(points, unit, amount) {
  if (amount === 0) return p => [...p];
  const origin = center(points), rx = .85 * amount * Math.PI / 180, ry = -.7 * amount * Math.PI / 180;
  const size = bounds(points);
  const camera = Math.max(800 * unit, Math.max(size.width, size.height) * 6);
  return p => {
    const x = p[0] - origin[0], y = p[1] - origin[1];
    const xx = x * Math.cos(ry), z = -x * Math.sin(ry);
    const yy = y * Math.cos(rx) - z * Math.sin(rx), zz = y * Math.sin(rx) + z * Math.cos(rx);
    const scale = camera / (camera - zz);
    return [origin[0] + xx * scale + .2 * unit * amount, origin[1] + yy * scale - 1.6 * unit * amount];
  };
}

export function bounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
