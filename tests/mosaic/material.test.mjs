import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendFrost, frostProfile, projectTile, roundedContour } from '../../projects/attune/mosaic/material.js';
import { contains, renderLayout } from '../../projects/attune/mosaic/appearance.js';
import { addToDocument, demoDocument } from '../../projects/attune/mosaic/mosaic.js';

test('rounded contours stay within inset polygons at desktop and mobile sizes', () => {
  for (const width of [285, 350, 1100]) for (const count of [1, 3, 8, 20, 47]) {
    let doc = demoDocument(Math.min(count, 20));
    for (let i = 20; i < count; i++) doc = addToDocument(doc, `Extra ${i}`, 'earth');
    const pieces = doc.current.pieces, original = JSON.stringify(pieces);
    const layout = renderLayout(pieces, width, 3.5);
    for (const polygon of layout.polygons.values()) {
      const contour = roundedContour(polygon, 2.5 * layout.unit);
      assert.ok(contour.path.endsWith('Z')); assert.ok(!/NaN|Infinity/.test(contour.path));
      for (const edge of contour.edges) for (const point of edge) assert.ok(contains(polygon, point));
      for (let i = 0; i < contour.corners.length; i++) {
        const c = contour.corners[i];
        if (!c.radius) continue;
        const start = Math.atan2(c.before[1] - c.center[1], c.before[0] - c.center[0]);
        const end = Math.atan2(c.after[1] - c.center[1], c.after[0] - c.center[0]);
        const sweep = (end - start + Math.PI * 2) % (Math.PI * 2);
        assert.ok(sweep < Math.PI, 'fillet takes the short interior arc');
        for (let sample = 0; sample <= 20; sample++) {
          const angle = start + sweep * sample / 20;
          assert.ok(contains(polygon, [c.center[0] + c.radius * Math.cos(angle), c.center[1] + c.radius * Math.sin(angle)]));
        }
        const next = contour.corners[(i + 1) % contour.corners.length];
        const full = Math.hypot(next.p[0] - c.p[0], next.p[1] - c.p[1]);
        const straight = Math.hypot(next.before[0] - c.after[0], next.before[1] - c.after[1]);
        assert.ok(straight >= full * .52 - 1e-7, 'rounding protects the straight edge');
      }
    }
    assert.equal(JSON.stringify(pieces), original);
  }
});

test('acute tips receive true-radius fillets and closed seam corners remain sharp and finite', () => {
  const triangle = [[0, 0], [200, 0], [200, 72.8]];
  const contour = roundedContour(triangle, 2.5), acute = contour.corners[0];
  assert.ok(Math.hypot(...acute.after) > 4 * 2.5);
  assert.ok(Math.abs(acute.radius - 2.5) < 1e-7);
  const closing = roundedContour(triangle, 2.5, p => p === triangle[0] ? 0 : 1);
  assert.equal(closing.corners[0].radius, 0); assert.deepEqual(closing.corners[0].after, triangle[0]);
  assert.ok(!/NaN|Infinity/.test(closing.path));
  assert.ok(!roundedContour(triangle, 0).path.includes('A'));
});

test('frosting varies only within bounded spreads and is stable for each activity', () => {
  const profiles = Array.from({ length: 47 }, (_, i) => frostProfile(i + 1));
  assert.equal(new Set(profiles.map(JSON.stringify)).size, 47);
  profiles.forEach((profile, i) => {
    assert.deepEqual(profile, frostProfile(i + 1));
    assert.ok(profile.x >= .16 && profile.x <= .28);
    assert.ok(profile.y >= .05 && profile.y <= .17);
    assert.ok(profile.spreadX >= .86 && profile.spreadX <= 1.04);
    assert.ok(profile.spreadY >= .70 && profile.spreadY <= .86);
  });
  assert.deepEqual(blendFrost(profiles[0], profiles[1], 0), profiles[0]);
  assert.deepEqual(blendFrost(profiles[0], profiles[1], 1), profiles[1]);
});

test('perspective is identity at rest, bounded at maximum intensity, and not an in-plane rotation', () => {
  const points = [[0, 0], [400, 0], [400, 400], [0, 400]], original = JSON.stringify(points);
  for (const width of [350, 1100]) {
    const unit = 432 / width;
    assert.deepEqual(projectTile(points, unit, 0), points);
    for (const pose of [-.1, 1, 2]) {
      const result = projectTile(points, unit, pose);
      result.forEach((p, i) => {
        assert.ok(p.every(Number.isFinite));
        assert.ok(Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) / unit < 12);
      });
      const top = Math.hypot(result[1][0] - result[0][0], result[1][1] - result[0][1]);
      const bottom = Math.hypot(result[2][0] - result[3][0], result[2][1] - result[3][1]);
      assert.ok(Math.abs(top - bottom) > .01, 'perspective foreshortens opposite edges differently');
    }
  }
  assert.equal(JSON.stringify(points), original);
});
