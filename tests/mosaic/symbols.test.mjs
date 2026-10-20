import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToDocument, demoDocument } from '../../projects/attune/mosaic/mosaic.js';
import { contains, renderLayout } from '../../projects/attune/mosaic/appearance.js';
import { tileProjection } from '../../projects/attune/mosaic/material.js';
import { SYMBOLS, symbolFit } from '../../projects/attune/mosaic/symbols.js';

test('symbols remain inside tiles, including dense mosaics, with deterministic placement', () => {
  let dense = demoDocument(20);
  for (let i = 20; i < 48; i++) dense = addToDocument(dense, `Extra ${i}`, 'water');
  for (const doc of [demoDocument(1), demoDocument(3), demoDocument(8), demoDocument(20), dense]) {
    const original = JSON.stringify(doc);
    for (const width of [285, 350, 850]) {
      const layout = renderLayout(doc.current.pieces, width, 4);
      for (const points of layout.polygons.values()) {
        const fit = symbolFit(points, layout.unit);
        assert.deepEqual(fit, symbolFit(points, layout.unit));
        assert.ok(fit.size > 0 && fit.size <= 44 * layout.unit);
        // The glyph's full circular extent, ink, and etched highlight stay inside.
        const extent = fit.size / 24 * 10 + fit.stroke / 2 + .6 * layout.unit;
        for (let i = 0; i < 64; i++) {
          const a = i * Math.PI / 32;
          assert.ok(contains(points, [fit.center[0] + Math.cos(a) * extent, fit.center[1] + Math.sin(a) * extent]));
        }
        if (width >= 350 && doc.current.pieces.length <= 20) assert.ok(fit.size / layout.unit >= 14, 'normal mobile demos have legible glyph sizes');
      }
    }
    assert.equal(JSON.stringify(doc), original);
  }
  assert.deepEqual(Object.keys(SYMBOLS).sort(), ['air', 'earth', 'fire', 'water']);
  assert.equal(new Set(Object.values(SYMBOLS).map(s => s.paths.join())).size, 4);
});

test('symbol anchors share the tile perspective plane, rather than tilting around themselves', () => {
  const polygon = [[0, 0], [200, 0], [140, 150], [0, 200]], fit = symbolFit(polygon, 1);
  const rest = tileProjection(polygon, 1, 0), press = tileProjection(polygon, 1, 1);
  assert.deepEqual(rest(fit.center), fit.center);
  assert.notDeepEqual(press(fit.center), fit.center);
  const c = press(fit.center), x = press([fit.center[0] + 1, fit.center[1]]);
  assert.ok(Math.abs(x[1] - c[1]) > 1e-6, 'glyph basis responds to the plane perspective');
});
