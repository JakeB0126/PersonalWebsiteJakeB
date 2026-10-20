import { area } from './mosaic.js';
import { center, insetPolygon, minWidth } from './appearance.js';

// Compact line glyphs share a 24-unit frame and a 10-unit circular footprint.
export const SYMBOL_PATHS = Object.freeze({
  fire: 'M12 2C13 7 19 8 19 14C19 18.5 16 21 12 21C8 21 5 18 5 14C5 10.5 7 8.5 9 7C8.5 10 10 11 11 11C13 9 13.5 5.5 12 2Z',
  earth: 'M19 5C12 4 5 6 5 13C5 17 8 19 11 19C18 19 20 12 19 5ZM5 19L15 9',
  water: 'M12 2C10 6 5 11 5 15C5 19 8 22 12 22C16 22 19 19 19 15C19 11 14 6 12 2Z',
  air: 'M4 8H14C18 8 18 3 15 3C13.5 3 13 4 13 5M3 12H19C22 12 22 16 19 16M5 16H12C15 16 15 21 12 21C10.5 21 10 20 10 19',
});

export function symbolFit(points, unit) {
  let low = 0, high = minWidth(points) / 2;
  for (let i = 0; i < 22; i++) {
    const mid = (low + high) / 2, inner = insetPolygon(points, mid);
    if (inner.length >= 3 && area(inner) > 1e-12) low = mid; else high = mid;
  }
  // A slightly relaxed inset avoids unstable centroids at a collapsed segment.
  const origin = center(insetPolygon(points, low * .96));
  const radius = Math.min(...points.map((a, i) => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length < 1e-8 ? Infinity : ((b[0] - a[0]) * (origin[1] - a[1]) - (b[1] - a[1]) * (origin[0] - a[0])) / length;
  }));
  const target = Math.min(32, Math.max(18, Math.sqrt(area(points)) / unit * .26)) * unit;
  // Include the line width and the subtle etched-light offset in the clearance.
  const size = Math.max(0, Math.min(target, 2.4 * Math.max(0, radius - 1.4 * unit)));
  const stroke = Math.min(1.5, Math.max(.9, size / unit * .065)) * unit;
  return { center: origin, radius, size, stroke };
}
