import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME, ELEMENTS, area, quality, newDocument, addToDocument, undoDocument, demoDocument, parseDocument } from '../../projects/attune/mosaic/mosaic.js';

// Independent convex polygon intersection (not the generation clipper).
function intersection(subject, clip) {
  let result = subject;
  for (let i = 0; i < clip.length && result.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = result;
    result = [];
    const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) result.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        const t = sp / (sp - sq); result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return result;
}
function validate(state) {
  assert.equal(new Set(state.pieces.map(p => p.activity.id)).size, state.pieces.length);
  assert.ok(Math.abs(state.pieces.reduce((sum, p) => sum + area(p.points), 0) - FRAME ** 2) < 1e-6, 'fills frame');
  for (const piece of state.pieces) {
    const points = piece.points;
    assert.ok(area(points) > 0);
    const q = quality(points);
    assert.ok(q.compactness >= .38 - 1e-9 && q.width >= .50 - 1e-9, 'no thin slivers');
    for (let i = 0; i < points.length; i++) {
      assert.ok(points[i].every(n => Number.isFinite(n) && n >= -1e-7 && n <= FRAME + 1e-7), 'inside frame');
      const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
      assert.ok((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= -1e-7, 'convex');
    }
  }
  for (let i = 0; i < state.pieces.length; i++) for (let j = i + 1; j < state.pieces.length; j++) {
    assert.ok(area(intersection(state.pieces[i].points, state.pieces[j].points)) < 1e-6, 'no pairwise overlap');
  }
}
test('100 seeds: all 20 additions fill the frame, preserve unrelated pieces and reject slivers', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let doc = newDocument(seed * 7931);
    for (let n = 0; n < 20; n++) {
      const before = JSON.stringify(doc), previous = doc.current;
      const largest = previous.pieces.length ? previous.pieces.reduce((a, b) => area(b.points) > area(a.points) ? b : a) : null;
      const next = addToDocument(doc, `Activity ${n + 1}`, Object.keys(ELEMENTS)[n % 4]);
      assert.equal(JSON.stringify(doc), before, 'addition never mutates prior state');
      assert.equal(next.current.pieces.length, n + 1);
      if (largest) {
        for (const p of previous.pieces) {
          const after = next.current.pieces.find(q => q.activity.id === p.activity.id);
          assert.deepEqual(after.activity, p.activity, 'preserves activity assignment');
          if (p !== largest) assert.deepEqual(after, p, 'unrelated piece unchanged');
        }
        const retained = next.current.pieces.find(p => p.activity.id === largest.activity.id), added = next.current.pieces.at(-1);
        const originalArea = area(largest.points);
        assert.ok(Math.abs(area(retained.points) + area(added.points) - originalArea) < 1e-6);
        assert.ok(area(added.points) / originalArea >= .36 - 1e-8 && area(added.points) / originalArea <= .64 + 1e-8);
        assert.ok(Math.abs(area(intersection(retained.points, largest.points)) - area(retained.points)) < 1e-6);
        assert.ok(Math.abs(area(intersection(added.points, largest.points)) - area(added.points)) < 1e-6);
      }
      validate(next.current); doc = next;
    }
  }
});
test('exact multi-level undo survives JSON persistence, including empty and repeated re-addition', () => {
  let doc = newDocument(712); const snapshots = [JSON.stringify(doc)];
  for (let i = 0; i < 20; i++) { doc = addToDocument(doc, `Same color ${i}`, 'air'); snapshots.push(JSON.stringify(doc)); }
  doc = parseDocument(JSON.stringify(doc));
  for (let i = 19; i >= 0; i--) { doc = undoDocument(doc); assert.equal(JSON.stringify(doc), snapshots[i]); }
  assert.equal(doc.current.pieces.length, 0); assert.equal(undoDocument(doc), doc);
  for (let i = 0; i < 20; i++) doc = addToDocument(doc, `Same color ${i}`, 'air');
  assert.equal(JSON.stringify(doc), snapshots[20], 'PRNG restoration produces exact same re-addition');
});
test('all demos use normal additions and undo down to empty', () => {
  for (const count of [1, 3, 8, 20]) {
    let doc = demoDocument(count); assert.equal(doc.current.pieces.length, count); validate(doc.current);
    let manually = newDocument(827419);
    for (const p of doc.current.pieces) manually = addToDocument(manually, p.activity.name, p.activity.element);
    assert.deepEqual(manually, doc);
    for (let i = count; i > 0; i--) { assert.equal(doc.current.pieces.length, i); doc = undoDocument(doc); }
    assert.equal(doc.current.pieces.length, 0);
  }
});
test('invalid activity and saved document input fail without mutation', () => {
  const doc = newDocument(1);
  for (const [name, element] of [['   ', 'fire'], ['valid', 'unknown'], ['x'.repeat(101), 'water']]) assert.throws(() => addToDocument(doc, name, element));
  for (const data of ['invalid', '{}', '{"version":2}', JSON.stringify({ ...demoDocument(3), history: [] })]) assert.throws(() => parseDocument(data));
  assert.equal(doc.current.pieces.length, 0);
});
