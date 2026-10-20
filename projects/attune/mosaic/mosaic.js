import { PALETTES } from './palettes.js';
// All geometry is in a fixed 400 × 400 frame. Rendering never modifies it.
export const FRAME = 400;
export const ELEMENTS = Object.freeze({
  fire: { label: 'Fire', meaning: 'Challenge & Exertion', color: PALETTES.light.colors.fire },
  earth: { label: 'Earth', meaning: 'Grounding & Restoration', color: PALETTES.light.colors.earth },
  water: { label: 'Water', meaning: 'Creative Expression', color: PALETTES.light.colors.water },
  air: { label: 'Air', meaning: 'Connection & Play', color: PALETTES.light.colors.air },
});
export const STORAGE_KEY = 'attune.weekly-mosaic.v1';
export const area = points => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export function quality(points) {
  const a = area(points);
  let perimeter = 0, width = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    perimeter += length;
    const projections = points.map(v => (-dy * v[0] + dx * v[1]) / length);
    width = Math.min(width, Math.max(...projections) - Math.min(...projections));
  }
  return { compactness: 4 * Math.PI * a / perimeter ** 2, width: width / Math.sqrt(a) };
}
// A crossing is calculated once, then inserted into both complementary children.
export function bisect(points, normal, offset) {
  const left = [], right = [];
  const distance = p => p[0] * normal[0] + p[1] * normal[1] - offset;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = distance(a), db = distance(b);
    if (da <= 0) left.push(a);
    if (da >= 0) right.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      const intersection = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      left.push(intersection); right.push(intersection);
    }
  }
  return [left, right];
}
function cutAtArea(points, angle, fraction) {
  const normal = [Math.cos(angle), Math.sin(angle)];
  const values = points.map(p => p[0] * normal[0] + p[1] * normal[1]);
  let low = Math.min(...values), high = Math.max(...values);
  const target = area(points) * fraction;
  for (let i = 0; i < 42; i++) {
    const mid = (low + high) / 2;
    if (area(bisect(points, normal, mid)[0]) < target) low = mid;
    else high = mid;
  }
  return bisect(points, normal, (low + high) / 2);
}
function randomSource(seed) {
  let state = seed >>> 0;
  return { next() { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; }, get seed() { return state; } };
}
export function splitPolygon(points, random) {
  let best = null, bestScore = -Infinity;
  // Broad, balanced candidates: always reject slivers, even if they look novel.
  for (let i = 0; i < 72; i++) {
    const angle = random.next() * Math.PI;
    const fraction = .36 + random.next() * .28;
    const halves = cutAtArea(points, angle, fraction);
    const qualities = halves.map(quality);
    if (qualities.some(q => q.compactness < .38 || q.width < .50)) continue;
    // Sample acceptable cuts evenly; maximizing compactness creates a near-grid.
    const score = random.next();
    if (score > bestScore) { best = halves; bestScore = score; }
  }
  if (!best) {
    // Deterministic fallback searches balanced cuts without weakening constraints.
    for (let i = 0; i < 180; i++) {
      const halves = cutAtArea(points, i * Math.PI / 180, .5);
      const qualities = halves.map(quality);
      if (qualities.some(q => q.compactness < .38 || q.width < .50)) continue;
      const score = Math.min(...qualities.map(q => q.compactness));
      if (score > bestScore) { best = halves; bestScore = score; }
    }
  }
  if (!best) throw new Error('A comfortable split could not be found. Your mosaic has been kept unchanged.');
  return random.next() < .5 ? best : [best[1], best[0]];
}
export function emptyState(seed = Date.now() >>> 0) { return { pieces: [], seed: seed >>> 0, nextId: 1 }; }
export function addActivity(state, name, element) {
  name = String(name).trim();
  if (!name || name.length > 100) throw new Error('Use an activity name between 1 and 100 characters.');
  if (!ELEMENTS[element]) throw new Error('Choose an element.');
  const activity = { id: state.nextId, name, element };
  const random = randomSource(state.seed);
  let pieces;
  if (!state.pieces.length) pieces = [{ activity, points: [[0, 0], [FRAME, 0], [FRAME, FRAME], [0, FRAME]] }];
  else {
    const largest = state.pieces.reduce((winner, piece, i, all) => area(piece.points) > area(all[winner].points) ? i : winner, 0);
    const [original, added] = splitPolygon(state.pieces[largest].points, random);
    pieces = state.pieces.map((piece, i) => i === largest ? { ...piece, points: original } : piece);
    pieces.push({ activity, points: added });
  }
  return { pieces, seed: random.seed, nextId: state.nextId + 1 };
}
export const newDocument = (seed) => ({ version: 1, current: emptyState(seed), history: [] });
export function addToDocument(doc, name, element) { return { ...doc, current: addActivity(doc.current, name, element), history: [...doc.history, doc.current] }; }
export function undoDocument(doc) { return doc.history.length ? { ...doc, current: doc.history.at(-1), history: doc.history.slice(0, -1) } : doc; }
const samples = [
  ['A walk without my phone', 'earth'], ['A proper catch-up', 'air'], ['Trying a new recipe', 'water'], ['The uphill run', 'fire'],
  ['Reading in the garden', 'earth'], ['Sketching the afternoon', 'water'], ['Dancing in the kitchen', 'air'], ['A new climbing route', 'fire'],
  ['A slow morning stretch', 'earth'], ['Coffee with a friend', 'air'], ['Playing the piano', 'water'], ['The last set', 'fire'],
  ['An early night', 'earth'], ['A very silly board game', 'air'], ['Writing a few lines', 'water'], ['Cycling up the hill', 'fire'],
  ['Tending to the plants', 'earth'], ['Lunch with family', 'air'], ['Making something by hand', 'water'], ['A swim in the lake', 'fire'],
];
export function demoDocument(count, seed = 827419) {
  if (![1, 3, 8, 20].includes(count)) throw new Error('Choose 1, 3, 8, or 20 demo activities.');
  let doc = newDocument(seed);
  for (let i = 0; i < count; i++) doc = addToDocument(doc, ...samples[i]);
  return doc;
}
function validState(state) {
  if (!state || !Number.isInteger(state.seed) || !Number.isInteger(state.nextId) || !Array.isArray(state.pieces)) return false;
  const ids = new Set();
  for (const p of state.pieces) {
    if (!p?.activity || !ELEMENTS[p.activity.element] || typeof p.activity.name !== 'string' || !p.activity.name.trim() || p.activity.name.length > 100 || !Number.isInteger(p.activity.id) || ids.has(p.activity.id)) return false;
    ids.add(p.activity.id);
    if (!Array.isArray(p.points) || p.points.length < 3 || p.points.some(v => !Array.isArray(v) || v.length !== 2 || v.some(n => !Number.isFinite(n) || n < -1e-6 || n > FRAME + 1e-6)) || area(p.points) <= 0) return false;
  }
  return state.pieces.length === state.nextId - 1 && (!state.pieces.length || Math.abs(state.pieces.reduce((sum, p) => sum + area(p.points), 0) - FRAME ** 2) < .01);
}
export function parseDocument(serialized) {
  const doc = JSON.parse(serialized);
  if (doc?.version !== 1 || !validState(doc.current) || !Array.isArray(doc.history) || doc.history.length !== doc.current.pieces.length || doc.history.some((s, i) => !validState(s) || s.pieces.length !== i)) throw new Error('The saved mosaic could not be read.');
  return doc;
}
