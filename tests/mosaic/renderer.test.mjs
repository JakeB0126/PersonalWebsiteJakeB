import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MosaicRenderer } from '../../projects/attune/mosaic/renderer.js';
import { DEFAULT_SETTINGS, pointsString } from '../../projects/attune/mosaic/appearance.js';
import { newDocument, addToDocument, undoDocument, demoDocument, ELEMENTS } from '../../projects/attune/mosaic/mosaic.js';

// Minimal SVG/event boundary with a controlled animation clock. This exercises the
// real renderer and its listeners while allowing events between individual frames.
class SvgNode {
  constructor(tag) {
    this.tag = tag; this.attrs = new Map(); this.children = []; this.dataset = {}; this.handlers = {};
    this.classes = new Set(); this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), toggle: (c, on) => on ? this.classes.add(c) : this.classes.delete(c) };
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'class') this.classes = new Set(String(v).split(' ')); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); if (k.startsWith('data-')) delete this.dataset[k.slice(5)]; }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parent = this; this.children.push(n); } }
  prepend(n) { n.remove(); n.parent = this; this.children.unshift(n); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  querySelector(selector) { for (const n of this.children) { if (n.classes.has(selector.slice(1))) return n; const found = n.querySelector(selector); if (found) return found; } return null; }
  closest(selector) { return this.classes.has(selector.slice(1)) ? this : this.parent?.closest(selector); }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  emit(type, event) { for (const handler of this.handlers[type] || []) handler(event); }
  getBoundingClientRect() { return { width: 350 }; }
  setPointerCapture(id) { this.pointer = id; }
  releasePointerCapture() { this.pointer = null; }
  getScreenCTM() { return { inverse: () => ({}) }; }
  createSVGPoint() { return { x: 0, y: 0, matrixTransform() { return this; } }; }
}
function harness(reduced = false) {
  let now = 0, next = 0; const frames = new Map(), selected = [];
  globalThis.document = { createElementNS: (_ns, tag) => new SvgNode(tag) };
  globalThis.window = new SvgNode('window');
  globalThis.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = callback => { const id = ++next; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const svg = new SvgNode('svg'), renderer = new MosaicRenderer(svg, { ...DEFAULT_SETTINGS }, id => selected.push(id));
  return { renderer, svg, selected, frames, step(ms = 16) { now += ms; const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(now); }, finish() { for (let i = 0; frames.size && i < 80; i++) this.step(); assert.equal(frames.size, 0); } };
}
function settled(h) {
  assert.equal(h.renderer.ghost, null); assert.equal(h.svg.dataset.animating, undefined);
  for (const tile of h.renderer.tiles.values()) {
    assert.equal(tile.visual.getAttribute('transform'), null); assert.equal(tile.visual.getAttribute('visibility'), null); assert.equal(tile.visual.getAttribute('opacity'), null);
    assert.equal(tile.visual.querySelector('.tile-surface').getAttribute('data-points'), pointsString(h.renderer.layout.polygons.get(tile.piece.activity.id)));
  }
}
test('20 rapid additions and undos cancel old frames and leave exact committed tiles', () => {
  const h = harness(); let doc = newDocument(713), snapshots = [JSON.stringify(doc)];
  h.renderer.render(doc.current.pieces);
  for (let i = 0; i < 20; i++) {
    const before = doc.current.pieces; doc = addToDocument(doc, `Activity ${i}`, ['fire', 'earth', 'water', 'air'][i % 4]);
    h.renderer.render(doc.current.pieces, { before, animate: true }); h.step(37); snapshots.push(JSON.stringify(doc));
    assert.equal(h.renderer.tiles.size, i + 1);
    const changed = new Set(doc.current.pieces.filter(p => !before.some(q => q.activity.id === p.activity.id && pointsString(q.points) === pointsString(p.points))).map(p => p.activity.id));
    for (const [id, tile] of h.renderer.tiles) if (!changed.has(id)) assert.equal(tile.visual.getAttribute('transform'), null, 'unrelated tiles stay still');
  }
  for (let i = 19; i >= 0; i--) {
    const before = doc.current.pieces; doc = undoDocument(doc); h.renderer.render(doc.current.pieces, { before, animate: true }); h.step(29);
    assert.equal(JSON.stringify(doc), snapshots[i]); assert.equal(h.renderer.tiles.size, i);
  }
  h.finish(); settled(h); assert.equal(h.renderer.scene.children.length, 0);
});
test('add–undo–add, settings changes, and repeated settle cannot strand transient visuals', () => {
  const h = harness(); let doc = addToDocument(newDocument(42), 'First', 'earth'); h.renderer.render(doc.current.pieces);
  let old = doc; doc = addToDocument(doc, 'Second', 'air'); h.renderer.render(doc.current.pieces, { before: old.current.pieces, animate: true }); h.step(); h.step(70);
  old = doc; doc = undoDocument(doc); h.renderer.render(doc.current.pieces, { before: old.current.pieces, animate: true }); h.step(); h.step(70);
  h.renderer.settle(); assert.ok(h.frames.size > 0, 'stray keyup must not cancel undo');
  old = doc; doc = addToDocument(doc, 'Third', 'water'); h.renderer.render(doc.current.pieces, { before: old.current.pieces, animate: true }); h.step();
  h.renderer.setSettings({ ...DEFAULT_SETTINGS, flat: true }); h.finish(); settled(h);
  h.renderer.press(1); h.step(); h.step(45); h.renderer.settle(); h.step(); h.step(60); h.renderer.settle(); h.finish(); settled(h);
});
test('pointer scrolling, cancellation, outside release, and keyboard paths restore tiles', () => {
  const h = harness(), doc = addToDocument(newDocument(1), 'First', 'earth'); h.renderer.render(doc.current.pieces);
  const tile = h.renderer.tiles.get(1), down = { target: tile.group, pointerId: 2, isPrimary: true, button: 0, clientX: 100, clientY: 100 };
  h.svg.emit('pointerdown', down); h.step(); h.step(90);
  window.emit('pointermove', { pointerId: 2, clientX: 100, clientY: 111 }); window.emit('pointerup', { pointerId: 2, clientX: 100, clientY: 111 }); h.finish(); settled(h); assert.deepEqual(h.selected, []);
  h.svg.emit('pointerdown', down); h.step(); window.emit('pointerup', { pointerId: 2, clientX: -10, clientY: -10 }); h.finish(); settled(h); assert.deepEqual(h.selected, []);
  h.svg.emit('pointerdown', down); h.step(); window.emit('pointercancel', {}); h.finish(); settled(h);
  h.svg.emit('pointerdown', down); h.svg.emit('focusout', {}); window.emit('pointerup', { pointerId: 2, clientX: 100, clientY: 100 }); assert.deepEqual(h.selected, [1]); h.finish(); settled(h);
  const key = { target: tile.group, key: ' ', repeat: false, preventDefault() {} };
  h.svg.emit('keydown', key); window.emit('scroll', {}); h.svg.emit('keyup', key); h.finish(); settled(h); assert.deepEqual(h.selected, [1, 1]);
});
test('reduced motion uses press highlight and never schedules movement', () => {
  const h = harness(true), first = addToDocument(newDocument(5), 'First', 'earth'), next = addToDocument(first, 'Second', 'earth');
  h.renderer.render(next.current.pieces, { before: first.current.pieces, animate: true });
  h.renderer.press(1); assert.ok(h.renderer.tiles.get(1).group.classes.has('is-pressed')); assert.equal(h.frames.size, 0);
  assert.equal(h.renderer.tiles.get(1).visual.getAttribute('transform'), null); h.renderer.settle(); h.finish(); settled(h);
});

const materialSnapshot = node => JSON.stringify({ tag: node.tag, attrs: [...node.attrs], children: node.children.map(materialSnapshot) });
test('press changes face, reflection and shadow independently, then restores every material attribute', () => {
  const h = harness(), first = addToDocument(newDocument(5), 'First', 'earth'), doc = addToDocument(first, 'Second', 'earth');
  h.renderer.render(doc.current.pieces);
  const tile = h.renderer.tiles.get(1), neighbor = h.renderer.tiles.get(2);
  const rest = materialSnapshot(tile.visual), still = materialSnapshot(neighbor.visual), geometry = JSON.stringify(doc);
  const value = (cls, attr) => tile.visual.querySelector(cls).getAttribute(attr);
  const shadowPath = value('.tile-shadow', 'd'), facePath = value('.tile-surface', 'd');
  const light = value('.face-light', 'gradientTransform'), blur = Number(value('.shadow-softness', 'stdDeviation'));
  h.renderer.press(1); h.step(); h.step(90);
  assert.notEqual(value('.tile-surface', 'd'), facePath);
  assert.equal(value('.tile-shadow', 'd'), shadowPath, 'cast shadow retains its backing contour');
  assert.notEqual(value('.face-light', 'gradientTransform'), light);
  assert.ok(Number(value('.shadow-softness', 'stdDeviation')) > blur);
  assert.equal(materialSnapshot(neighbor.visual), still);
  h.renderer.settle(); h.finish(); settled(h);
  assert.equal(materialSnapshot(tile.visual), rest);
  assert.equal(JSON.stringify(doc), geometry);
  h.renderer.press(1); h.step(); h.step(40); h.renderer.setSettings({ ...DEFAULT_SETTINGS }); h.finish();
  assert.equal(materialSnapshot(tile.visual), rest, 'interrupted material resets with settings');
  h.renderer.press(1); const next = addToDocument(doc, 'Third', 'water');
  h.renderer.render(next.current.pieces, { before: doc.current.pieces, animate: true }); h.step();
  h.renderer.render(doc.current.pieces, { before: next.current.pieces, animate: true }); h.finish(); settled(h);
  assert.equal(materialSnapshot(tile.visual), rest, 'press → split → undo resets material');
});

test('quick taps show feedback and select immediately, while canceled presses do not finish a tap', () => {
  const h = harness(), doc = addToDocument(newDocument(1), 'First', 'air'); h.renderer.render(doc.current.pieces);
  const tile = h.renderer.tiles.get(1), event = { target: tile.group, pointerId: 2, isPrimary: true, button: 0, clientX: 100, clientY: 100 };
  h.svg.emit('pointerdown', event); window.emit('pointerup', event);
  assert.deepEqual(h.selected, [1]); assert.ok(h.frames.size > 0);
  h.step(); h.step(55); assert.ok(h.renderer.pose >= .64); h.finish(); settled(h);
  h.svg.emit('pointerdown', event); window.emit('pointercancel', event);
  h.step(); h.step(55); assert.ok(h.renderer.pose < .18); h.finish(); settled(h);
});

test('split children share shadow stacking until the seam opens and restore their own layers afterward', () => {
  const h = harness(), first = addToDocument(newDocument(3), 'First', 'earth'), next = addToDocument(first, 'Second', 'earth');
  h.renderer.render(next.current.pieces, { before: first.current.pieces, animate: true });
  const parentVisual = h.renderer.tiles.get(1).visual, newVisual = h.renderer.tiles.get(2).visual;
  assert.equal(newVisual.querySelector('.tile-underlay'), null);
  assert.equal(parentVisual.children[0].getAttribute('class'), 'tile-underlay');
  assert.equal(parentVisual.children.filter(n => n.getAttribute('class') === 'tile-underlay').length, 2);
  h.finish(); settled(h);
  assert.ok(newVisual.querySelector('.tile-underlay'));
  assert.equal(parentVisual.children.filter(n => n.getAttribute('class') === 'tile-underlay').length, 1);
});

function frostingValues(tile) {
  const light = tile.visual.querySelector('.face-light');
  return { light: light.getAttribute('gradientTransform'), stops: light.children.map(n => [...n.attrs]), grain: tile.visual.querySelector('.face-frost').getAttribute('patternTransform') };
}
test('frosting blends from the parent during splitting and survives reload and undo exactly', () => {
  const h = harness(), first = addToDocument(newDocument(3), 'First', 'fire'), next = addToDocument(first, 'Second', 'fire');
  h.renderer.render(first.current.pieces);
  const parent = frostingValues(h.renderer.tiles.get(1));
  h.renderer.render(next.current.pieces, { before: first.current.pieces, animate: true });
  for (const tile of h.renderer.tiles.values()) assert.deepEqual(frostingValues(tile), parent, 'closed seam retains parent material');
  h.finish(); settled(h);
  const children = [...h.renderer.tiles.values()].map(frostingValues);
  assert.notEqual(children[0].grain, children[1].grain);
  for (const tile of h.renderer.tiles.values()) {
    assert.notEqual(tile.visual.querySelector('.edge-glint').getAttribute('stroke'), '#FFFFFF');
    assert.equal(tile.visual.querySelector('.tile-surface').getAttribute('fill'), '#D91816');
  }
  h.renderer.render(first.current.pieces, { before: next.current.pieces, animate: true }); h.finish();
  assert.deepEqual(frostingValues(h.renderer.tiles.get(1)), parent);
  const reloaded = harness(); reloaded.renderer.render(JSON.parse(JSON.stringify(next)).current.pieces);
  assert.deepEqual([...reloaded.renderer.tiles.values()].map(frostingValues), children);
});

test('all three finishes preserve geometry and match every symbol to its activity', () => {
  const h = harness(), doc = demoDocument(20), original = JSON.stringify(doc);
  for (const finish of ['glass', 'flat', 'frosted', 'glass']) {
    h.renderer.setSettings({ ...DEFAULT_SETTINGS, finish, flat: finish === 'flat' }); h.renderer.render(doc.current.pieces);
    for (const tile of h.renderer.tiles.values()) {
      assert.equal(tile.visual.querySelector('.tile-symbol').getAttribute('data-element'), tile.piece.activity.element);
      assert.equal(tile.visual.querySelector('.tile-surface').getAttribute('fill'), ELEMENTS[tile.piece.activity.element].color);
      assert.equal(Boolean(tile.visual.querySelector('.glass-reflection')), finish === 'glass');
      assert.equal(Boolean(tile.visual.querySelector('.tile-texture')), finish === 'frosted');
      assert.equal(tile.group.querySelector('.tile-hit').getAttribute('points'), pointsString(tile.piece.points));
    }
    settled(h); assert.equal(JSON.stringify(doc), original);
  }
  const tile = h.renderer.tiles.get(1), before = materialSnapshot(tile.visual);
  h.renderer.press(1); h.step(); h.step(90);
  assert.notEqual(materialSnapshot(tile.visual), before);
  h.renderer.settle(true); h.finish(); assert.equal(materialSnapshot(tile.visual), before);
});

test('glass split/undo interruption leaves one correct glyph per tile and returns to empty', () => {
  const h = harness(); h.renderer.setSettings({ ...DEFAULT_SETTINGS, finish: 'glass' });
  let doc = newDocument(713); const history = [];
  for (let i = 0; i < 20; i++) {
    history.push(doc); const before = doc.current.pieces;
    doc = addToDocument(doc, `Activity ${i}`, ['fire', 'earth', 'water', 'air'][i % 4]);
    h.renderer.render(doc.current.pieces, { before, animate: true }); h.step(25);
    if (i % 4 === 0) { h.renderer.press(doc.current.pieces[0].activity.id); h.step(); h.renderer.settle(true); }
  }
  while (history.length) {
    const before = doc.current.pieces; doc = undoDocument(doc);
    assert.deepEqual(doc, history.pop()); h.renderer.render(doc.current.pieces, { before, animate: true }); h.step(25);
  }
  h.finish(); settled(h); assert.equal(h.renderer.scene.children.length, 0);
  const reduced = harness(true); reduced.renderer.setSettings({ ...DEFAULT_SETTINGS, finish: 'glass' });
  reduced.renderer.render(demoDocument(3).current.pieces); reduced.renderer.press(1);
  assert.equal(reduced.frames.size, 0); assert.ok(reduced.renderer.tiles.get(1).group.classes.has('is-pressed'));
});


test('paired palette changes preserve selection, geometry, undo and colors through interrupted transitions', async () => {
  const { PALETTES, colorFor, inkFor } = await import('../../projects/attune/mosaic/palettes.js');
  const h = harness(), doc = demoDocument(20), snapshot = JSON.stringify(doc);
  h.renderer.render(doc.current.pieces); h.renderer.select(3);
  for (const darkMode of [true, false, true]) {
    h.renderer.setSettings({ ...DEFAULT_SETTINGS, darkMode });
    for (const [id, tile] of h.renderer.tiles) {
      assert.equal(tile.visual.querySelector('.tile-surface').getAttribute('fill'), colorFor(tile.piece.activity.element, {darkMode}));
      assert.equal(tile.visual.querySelector('.symbol-ink').getAttribute('fill'), inkFor(tile.piece.activity.element, {darkMode}));
      assert.equal(tile.group.dataset.geometry, pointsString(tile.piece.points));
      assert.equal(tile.group.getAttribute('aria-pressed'), String(id === 3));
    }
    assert.equal(JSON.stringify(doc), snapshot);
    const next = addToDocument(doc, 'Palette transition', 'water');
    h.renderer.render(next.current.pieces, { before: doc.current.pieces, animate: true });
    h.step(); h.step(70);
    h.renderer.setSettings({ ...DEFAULT_SETTINGS, darkMode }); h.finish(); settled(h);
    assert.equal(h.renderer.tiles.get(next.current.nextId - 1).visual.querySelector('.tile-surface').getAttribute('fill'), PALETTES[darkMode ? 'dark' : 'light'].colors.water);
    h.renderer.render(undoDocument(next).current.pieces, {before: next.current.pieces, animate:true}); h.finish(); settled(h);
    assert.deepEqual(undoDocument(next), doc);
  }
});
