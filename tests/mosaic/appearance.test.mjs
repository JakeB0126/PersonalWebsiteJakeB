import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoDocument, area } from '../../projects/attune/mosaic/mosaic.js';
import { VIEW_SIZE, insetPolygon, renderLayout, minWidth, contains, transitionPair, transitionPolygons, PressGesture, parseSettings } from '../../projects/attune/mosaic/appearance.js';

const rectangle = [[0, 0], [100, 0], [100, 80], [0, 80]];
const distance = (p, a, b) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
test('parallel-edge inset gives a true offset, including diagonal shared seams', () => {
  const result = insetPolygon(rectangle, 2);
  assert.equal(area(result), 96 * 76);
  for (const p of result) assert.ok(Math.min(...[2, 98].map(v => Math.abs(v - p[0]))) < 1e-9 && Math.min(...[2, 78].map(v => Math.abs(v - p[1]))) < 1e-9);
  const a = [[0, 0], [100, 0], [100, 100]], b = [[0, 0], [100, 100], [0, 100]];
  for (const cssWidth of [350, 760, 1100]) {
    const pieces = [a, b].map((points, i) => ({ activity: { id: i }, points }));
    const layout = renderLayout(pieces, cssWidth, 3.5);
    const normalGap = Math.min(...layout.polygons.get(0).map(p => (p[0] - p[1]) / Math.SQRT2)) - Math.max(...layout.polygons.get(1).map(p => (p[0] - p[1]) / Math.SQRT2));
    assert.ok(Math.abs(normalGap / layout.unit - 3.5) < 1e-9);
  }
});
test('all 1/3/8/20 demo tiles retain area, constant CSS offsets, and original coordinates', () => {
  for (const count of [1, 3, 8, 20]) for (const width of [350, 760]) for (const gap of [1, 3.5, 8]) {
    const doc = demoDocument(count), before = JSON.stringify(doc), layout = renderLayout(doc.current.pieces, width, gap);
    assert.ok(Math.abs(layout.gap - gap) < 1e-7, 'normal demo should not need a safety cap');
    for (const piece of doc.current.pieces) {
      const points = layout.polygons.get(piece.activity.id);
      assert.ok(points.length >= 3 && area(points) > area(piece.points) * .25);
      for (const p of points) assert.ok(contains(piece.points, p));
      for (let i = 0; i < piece.points.length; i++) {
        const a = piece.points[i], b = piece.points[(i + 1) % piece.points.length];
        const nearest = Math.min(...points.map(p => distance(p, a, b)));
        assert.ok(nearest >= layout.distance - 1e-7, 'all supporting edges offset by at least requested inset');
        // Short edges can disappear during inset; every surviving supporting edge is parallel.
        if (points.filter(p => Math.abs(distance(p, a, b) - layout.distance) < 1e-6).length >= 2) assert.ok(Math.abs(nearest * 2 / layout.unit - gap) < 1e-6);
      }
    }
    assert.equal(JSON.stringify(doc), before, 'appearance never mutates saved document');
  }
});
test('an extreme narrow tile reduces the global inset uniformly instead of disappearing', () => {
  const pieces = [{ activity: { id: 1 }, points: [[0, 0], [2, 0], [2, 400], [0, 400]] }, { activity: { id: 2 }, points: [[2, 0], [400, 0], [400, 400], [2, 400]] }];
  const layout = renderLayout(pieces, 350, 8);
  assert.ok(layout.gap < 8 && layout.gap > 0);
  assert.ok(minWidth(layout.polygons.get(1)) >= 1.1 - 1e-7);
  const leftEdge = Math.max(...layout.polygons.get(1).map(p => p[0]));
  const rightEdge = Math.min(...layout.polygons.get(2).map(p => p[0]));
  assert.ok(Math.abs(rightEdge - leftEdge - layout.distance * 2) < 1e-7);
});
test('split and reverse identify only the two affected tiles and close the seam exactly', () => {
  const doc = demoDocument(20);
  for (let i = 1; i < doc.history.length; i++) {
    const before = doc.history[i].pieces, after = i + 1 === doc.history.length ? doc.current.pieces : doc.history[i + 1].pieces;
    const split = transitionPair(before, after), undo = transitionPair(after, before);
    assert.ok(split && undo && !split.undo && undo.undo);
    assert.deepEqual(split.children, undo.children);
    const d = 3.5 / 2 * VIEW_SIZE / 350;
    const closedArea = transitionPolygons(split, d, 0).reduce((sum, p) => sum + area(p), 0);
    assert.ok(Math.abs(closedArea - area(insetPolygon(split.original.points, d))) < 1e-6);
  }
});
test('opening a seam never changes the inset parent perimeter, including acute corners', () => {
  for (const seed of [27, 196, 321]) {
    const doc = demoDocument(20, seed * 7931);
    for (let i = 1; i < 20; i++) {
      const before = doc.history[i].pieces, after = i === 19 ? doc.current.pieces : doc.history[i + 1].pieces;
      const pair = transitionPair(before, after), d = 8 / 2 * VIEW_SIZE / 350, parent = insetPolygon(pair.original.points, d);
      for (const phase of [0, .25, .5, 1]) {
        const shapes = transitionPolygons(pair, d, phase);
        for (const shape of shapes) for (const p of shape) assert.ok(contains(parent, p), 'all transition points stay inside old rendered perimeter');
        if (phase === 0) assert.ok(Math.abs(shapes.reduce((sum, p) => sum + area(p), 0) - area(parent)) < 1e-6);
        if (phase === 1) shapes.forEach((p, j) => assert.ok(Math.abs(area(p) - area(insetPolygon(pair.children[j].points, d))) < 1e-6));
      }
    }
  }
});
test('press gesture cancels on scroll-sized movement, outside release, and pointer cancellation', () => {
  const press = new PressGesture();
  press.start(4, 10, 100, 100); assert.equal(press.move(11, 200, 200), false); assert.equal(press.release(11, true), null);
  assert.equal(press.move(10, 101, 102), false); assert.equal(press.release(10, true), 4);
  press.start(4, 10, 100, 100); assert.equal(press.move(10, 100, 109), true); assert.equal(press.release(10, true), null);
  press.start(4, 10, 100, 100); assert.equal(press.release(10, false), null);
  press.start(4, 10, 100, 100); press.cancel(); assert.equal(press.release(10, true), null);
});
test('saved appearance settings are isolated and bounded', () => {
  assert.equal(parseSettings('{"gap":99,"width":12}').gap, 8);
  assert.equal(parseSettings('{"gap":99,"width":12}').width, 350);
  assert.equal(parseSettings('bad data').gap, 3.5);
  assert.equal(parseSettings('{"flat":true}').finish, 'frosted');
  assert.equal(parseSettings('{"flat":false,"texture":50}').finish, 'frosted');
  assert.equal(parseSettings('{"finish":"glass","flat":true}').finish, 'glass');
  assert.equal(parseSettings(JSON.stringify(parseSettings('{"finish":"glass","gap":4}'))).finish, 'glass');
});

test('legacy Flat and icon settings migrate without changing other appearance preferences', () => {
 for(const legacy of [{finish:'flat',showIcons:true},{flat:true,showIcons:true},{finish:'glass',flat:false,showIcons:true},{finish:'frosted',showIcons:false}]) {
  const migrated=parseSettings(JSON.stringify({...legacy,darkMode:true,gap:4,width:420,motion:.5}));
  assert.equal(migrated.finish,legacy.finish==='glass'?'glass':'frosted');
  assert.equal('flat' in migrated,false); assert.equal('showIcons' in migrated,false);
  assert.equal(migrated.darkMode,true); assert.equal(migrated.gap,4); assert.equal(migrated.width,420); assert.equal(migrated.motion,.5);
  assert.deepEqual(parseSettings(JSON.stringify(migrated)),migrated);
 }
});
