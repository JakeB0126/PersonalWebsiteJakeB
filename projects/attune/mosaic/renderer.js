import { ELEMENTS } from './mosaic.js';
import { PressGesture, center, contains, finishOf, insetPolygon, mixColor, pointsString, renderLayout, transitionPair, transitionPolygons } from './appearance.js';
import { blendFrost, bounds, frostProfile, tileProjection, roundedContour } from './material.js';
import { SYMBOL_PATHS, symbolFit } from './symbols.js';
const NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value); return n; };
const smooth = t => t * t * (3 - 2 * t);
const clamp = t => Math.max(0, Math.min(1, t));
let materialId = 0;

export class MosaicRenderer {
  constructor(svg, settings, onSelect, onLayout) {
    this.svg = svg; this.settings = settings; this.onSelect = onSelect; this.onLayout = onLayout;
    this.pieces = []; this.tiles = new Map(); this.ticks = new Set(); this.revision = 0; this.gesture = new PressGesture();
    this.selected = null; this.pressedId = null; this.pose = 0; this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.svg.setAttribute('viewBox', '-16 -16 432 432');
    this.svg.append(this.defs = node('defs'), this.scene = node('g', { class: 'tile-scene' }));
    this.reduced.addEventListener('change', () => this.render(this.pieces));
    this.bindEvents();
    this.observer = new ResizeObserver(() => {
      const width = this.svg.getBoundingClientRect().width;
      if (Math.abs(width - (this.width || 0)) > .25) this.render(this.pieces);
    });
    this.observer.observe(svg);
  }
  motionEnabled() { return !this.reduced.matches && this.settings.motion > 0; }
  stopTicks() { this.revision++; for (const tick of this.ticks) cancelAnimationFrame(tick); this.ticks.clear(); }
  cancel() {
    this.stopTicks(); this.gesture.cancel(); this.pressedId = null; this.pose = 0;
    if (this.captureId !== undefined) { try { this.svg.releasePointerCapture(this.captureId); } catch {} this.captureId = undefined; }
    this.ghost?.remove(); this.ghost = null; this.svg.removeAttribute('data-animating');
    for (const tile of this.tiles.values()) { tile.visual.removeAttribute('transform'); tile.visual.removeAttribute('visibility'); tile.visual.removeAttribute('opacity'); tile.group.classList.remove('is-pressed'); }
  }
  animate(duration, update, finish = () => {}) {
    const revision = this.revision; let start;
    const schedule = () => { const handle = requestAnimationFrame(time => {
      this.ticks.delete(handle); if (revision !== this.revision) return;
      start ??= time; const t = Math.min(1, (time - start) / duration); update(t);
      if (t < 1) schedule(); else finish();
    }); this.ticks.add(handle); };
    update(0); schedule();
  }
  createDefs() {
    const u = this.layout.unit, grain = 64 * u;
    this.defs.innerHTML = `
      <linearGradient id="glass-tone" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="400">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".08"/>
        <stop offset=".48" stop-color="#FFFFFF" stop-opacity="0"/>
        <stop offset="1" stop-color="#242824" stop-opacity=".065"/>
      </linearGradient>
      <filter id="soft-edge" filterUnits="userSpaceOnUse" x="-48" y="-48" width="496" height="496" color-interpolation-filters="sRGB">
        <feGaussianBlur stdDeviation="${.8 * u}"/>
      </filter>
      <filter id="grain-noise" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="${.8 / u}" numOctaves="2" seed="19" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <pattern id="frost-grain" patternUnits="userSpaceOnUse" width="${grain}" height="${grain}">
        <rect width="${grain}" height="${grain}" filter="url(#grain-noise)"/>
      </pattern>`;
  }
  makeTile(piece, ghost = false) {
    const group = node('g', ghost ? { class: 'transition-tile', 'aria-hidden': 'true', 'pointer-events': 'none' } : {
      class: 'piece', 'data-id': piece.activity.id, role: 'button', tabindex: '0', 'aria-label': `${piece.activity.name} — ${ELEMENTS[piece.activity.element].label}`,
    });
    const visual = node('g', { class: 'tile-visual', 'pointer-events': 'none' }); group.append(visual);
    if (!ghost) group.append(node('polygon', { class: 'tile-hit', points: pointsString(piece.points), fill: 'transparent' }));
    return { group, visual, piece, materialId: `glass-${++materialId}` };
  }
  paint(tile, points, color = ELEMENTS[tile.piece.activity.element].color, seam = null, seamVisibility = 1, pose = 0, lightBounds = null, frosting = frostProfile(tile.piece.activity.id)) {
    const u = this.layout.unit, finish = finishOf(this.settings), flat = finish === 'flat', glass = finish === 'glass', depth = this.settings.shadow * (glass ? 1.15 : 1);
    const amount = pose * this.settings.motion, lift = Math.max(0, amount), id = tile.materialId;
    const project = tileProjection(points, u, amount), facePoints = points.map(project), shape = pointsString(facePoints);
    const nearSeam = p => {
      if (!seam) return false;
      const [a, b] = seam, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / length <= this.layout.distance + 1e-5;
    };
    const contour = roundedContour(facePoints, 2.5 * u, p => nearSeam(p) ? seamVisibility : 1);
    const restContour = roundedContour(points, 2.5 * u, p => nearSeam(p) ? seamVisibility : 1);
    const path = contour.path, b = lightBounds || bounds(facePoints);
    const glow = mixColor(color, '#FFF9EF', .70), glint = mixColor(color, '#FFF9EF', .80);
    tile.visual.replaceChildren();
    if (!flat) {
      const defs = node('defs'), clip = node('clipPath', { id: `${id}-clip` }); clip.append(node('path', { d: path })); defs.append(clip);
      // Reflection and absorption form a broad, diffuse lens; they are not a
      // white stripe. Light stays upper-left, with only the pressed face reacting.
      const reflection = node('radialGradient', { id: `${id}-reflection`, class: 'face-light', gradientUnits: 'userSpaceOnUse', cx: '0', cy: '0', r: '1', gradientTransform: `translate(${b.x + b.width * (frosting.x + .08 * amount)},${b.y + b.height * (frosting.y + .06 * amount)}) scale(${Math.max(u, b.width * frosting.spreadX)},${Math.max(u, b.height * frosting.spreadY)})` });
      for (const [offset, opacity] of [[0, .29 + .05 * lift], [frosting.shoulder, .18 + .03 * lift], [1, 0]]) reflection.append(node('stop', { offset, 'stop-color': glint, 'stop-opacity': opacity * (glass ? .36 : 1) }));
      const absorption = node('linearGradient', { id: `${id}-absorption`, gradientUnits: 'userSpaceOnUse', x1: b.x, y1: b.y, x2: b.x + b.width * .65, y2: b.y + b.height });
      absorption.append(node('stop', { offset: '.36', 'stop-color': color, 'stop-opacity': 0 }), node('stop', { offset: '1', 'stop-color': mixColor(color, '#242824', .34), 'stop-opacity': '.22' }));
      const grain = node('pattern', { id: `${id}-grain`, class: 'face-frost', href: '#frost-grain', patternTransform: `translate(${frosting.grainX * u},${frosting.grainY * u}) rotate(${frosting.grainAngle})` });
      defs.append(reflection, absorption, grain);
      if (glass) {
        const sheen = node('radialGradient', { id: `${id}-specular`, class: 'glass-light', gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 1, gradientTransform: `translate(${b.x + b.width * (.30 + .08 * amount)},${b.y + b.height * (.23 + .05 * amount)}) rotate(-24) scale(${Math.max(u, b.width * .95)},${Math.max(2 * u, b.height * .16)})` });
        for (const [offset, opacity] of [[0, .34 + .05 * lift], [.40, .23], [.78, .055], [1, 0]]) sheen.append(node('stop', { offset, 'stop-color': '#FFFCF6', 'stop-opacity': opacity }));
        const body = node('linearGradient', { id: `${id}-body`, x1: 0, y1: 0, x2: '.25', y2: 1 });
        for (const [offset, tint, opacity] of [[0, glint, .13], [.32, glint, 0], [.72, mixColor(color, '#242824', .45), .18], [1, glow, .13]]) body.append(node('stop', { offset, 'stop-color': tint, 'stop-opacity': opacity }));
        defs.append(sheen, body);
      }
      if (depth > 0) {
        const shadow = node('filter', { id: `${id}-shadow`, filterUnits: 'userSpaceOnUse', x: -48, y: -48, width: 496, height: 496, 'color-interpolation-filters': 'sRGB' });
        shadow.append(node('feGaussianBlur', { class: 'shadow-softness', stdDeviation: (1.05 + .95 * lift) * depth * u })); defs.append(shadow);
      }
      tile.visual.append(defs);
      const underlay = node('g', { class: 'tile-underlay' });
      if (depth > 0) {
        // The cast shadow stays on the backing while the face tilts above it.
        underlay.append(node('path', { class: 'tile-shadow', d: restContour.path, fill: '#514A40', opacity: .23 - .025 * Math.min(2, lift), transform: `translate(${(.45 + .75 * lift) * depth * u},${(1.4 + 1.35 * lift) * depth * u})`, filter: `url(#${id}-shadow)` }));
      }
      underlay.append(node('path', { class: 'tile-depth', d: path, fill: mixColor(color, '#242824', glass ? .23 : .18), transform: `translate(${.18 * u},${(glass ? 1.15 : .95) * u})` }));
      tile.visual.append(underlay);
    }
    const base = node('path', { class: 'tile-surface', d: path, 'data-points': shape, fill: color });
    tile.visual.append(base);
    if (!flat) {
      tile.visual.append(node('path', { d: path, fill: 'url(#glass-tone)' }), node('path', { d: path, fill: `url(#${id}-absorption)` }), node('path', { class: 'tile-reflection', d: path, fill: `url(#${id}-reflection)` }));
      if (glass) tile.visual.append(node('path', { class: 'glass-body', d: path, fill: `url(#${id}-body)` }), node('path', { class: 'glass-reflection', d: path, fill: `url(#${id}-specular)` }));
      if (!glass && this.settings.texture > 0) tile.visual.append(node('path', { class: 'tile-texture', d: path, fill: `url(#${id}-grain)`, opacity: .10 * this.settings.texture / 100 }));
      const edges = node('g', { 'clip-path': `url(#${id}-clip)` });
      // A faint colored contour carries light around rounded tips. Directional
      // bands below provide the definition without a chalk-white outline.
      edges.append(node('path', { class: 'edge-contour', d: path, fill: 'none', stroke: glass ? glint : glow, 'stroke-opacity': (glass ? .30 : .12) * seamVisibility, 'stroke-width': 1.1 * u }));
      for (let i = 0; i < points.length; i++) {
        const a = facePoints[i], next = facePoints[(i + 1) % points.length], dx = next[0] - a[0], dy = next[1] - a[1], length = Math.hypot(dx, dy);
        if (length < 1e-8) continue;
        const light = (dy * -.55 - dx * -.83) / length;
        const fade = nearSeam(points[i]) && nearSeam(points[(i + 1) % points.length]) ? seamVisibility : 1;
        const [start, end] = contour.edges[i], d = `M${start}L${end}`;
        const strength = (light > 0 ? (.23 + light * .48) * (1 + .15 * amount) : -light * .30) * fade;
        edges.append(node('path', { class: 'edge-band', d, fill: 'none', stroke: light > 0 ? glow : mixColor(color, '#242824', .40), 'stroke-opacity': strength * (glass ? .7 : 1), 'stroke-width': (glass ? 2.6 : 3.6) * u, filter: 'url(#soft-edge)', 'stroke-linecap': 'round' }));
        if (light > 0) edges.append(node('path', { class: 'edge-glint', d, fill: 'none', stroke: glass ? '#FFFAF2' : glint, 'stroke-opacity': (glass ? .26 + light * .48 : .14 + light * .24) * fade, 'stroke-width': (glass ? .85 : .65) * u, 'stroke-linecap': 'round' }));
      }
      tile.visual.append(edges);
    }
    tile.visual.append(node('path', { class: 'press-sheen', d: path, fill: '#FFFFFF' }));
    if (this.settings.showIcons !== false) {
      const fit = tile.symbolFit || symbolFit(points, u), anchor = project(fit.center), px = project([fit.center[0] + 1, fit.center[1]]), py = project([fit.center[0], fit.center[1] + 1]);
      const scale = fit.size / 24;
      const symbol = node('g', { class: 'tile-symbol', 'data-element': tile.piece.activity.element, 'data-size': fit.size / u, 'aria-hidden': 'true', opacity: seam ? smooth(clamp((seamVisibility - .22) / .78)) : 1, transform: `matrix(${px[0] - anchor[0]} ${px[1] - anchor[1]} ${py[0] - anchor[0]} ${py[1] - anchor[1]} ${anchor[0]} ${anchor[1]}) scale(${scale}) translate(-12 -12)`, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (scale > 0) {
        const glyph = SYMBOL_PATHS[tile.piece.activity.element];
        if (!flat) symbol.append(node('path', { d: glyph, stroke: '#FFF9EF', 'stroke-opacity': glass ? .46 : .26, 'stroke-width': fit.stroke / scale, transform: `translate(0,${.6 * u / scale})` }));
        symbol.append(node('path', { class: 'symbol-ink', d: glyph, stroke: '#242824', 'stroke-opacity': '.84', 'stroke-width': fit.stroke / scale }));
      }
      tile.visual.append(symbol);
    }
    tile.visual.append(node('path', { class: 'focus-ring', d: path, fill: 'none', stroke: '#242824', 'stroke-width': 1.5 * u, 'stroke-dasharray': `${3 * u} ${3 * u}` }));
    tile.visual.append(node('path', { class: 'selection-mark', d: path, fill: 'none', stroke: '#242824', 'stroke-width': .85 * u }));
  }
  select(id) { this.selected = id; for (const [key, tile] of this.tiles) { tile.group.setAttribute('aria-pressed', String(key === id)); tile.group.classList.toggle('is-selected', key === id); } }
  render(pieces, { before = null, animate = false } = {}) {
    this.cancel(); this.pieces = pieces; this.width = this.svg.getBoundingClientRect().width || 350;
    this.layout = renderLayout(pieces, this.width, this.settings.gap); this.createDefs();
    this.svg.dataset.effectiveGap = this.layout.gap.toFixed(3);
    this.svg.dataset.reducedMotion = String(this.reduced.matches);
    this.svg.classList.toggle('flat-mode', finishOf(this.settings) === 'flat');
    this.svg.dataset.finish = finishOf(this.settings);
    const ids = new Set(pieces.map(p => p.activity.id));
    for (const [id, tile] of this.tiles) if (!ids.has(id)) { tile.group.remove(); this.tiles.delete(id); }
    for (const piece of pieces) {
      const id = piece.activity.id;
      if (!this.tiles.has(id)) { const tile = this.makeTile(piece); this.tiles.set(id, tile); this.scene.append(tile.group); }
      const tile = this.tiles.get(id); tile.piece = piece;
      tile.symbolFit = symbolFit(this.layout.polygons.get(id), this.layout.unit);
      tile.group.dataset.geometry = pointsString(piece.points);
      tile.group.setAttribute('aria-label', `${piece.activity.name} — ${ELEMENTS[piece.activity.element].label}`);
      tile.group.querySelector('.tile-hit').setAttribute('points', pointsString(piece.points));
      this.paint(tile, this.layout.polygons.get(id));
    }
    this.select(this.selected); this.onLayout?.({ width: this.width, gap: this.layout.gap });
    if (animate && before && this.motionEnabled()) {
      const pair = transitionPair(before, pieces);
      if (pair) this.animatePair(pair);
      else if (!before.length && pieces.length === 1) this.fadeTile(this.tiles.get(pieces[0].activity.id));
      else if (before.length === 1 && !pieces.length) this.fadeLast(before[0]);
    }
  }
  setSettings(settings) { this.settings = settings; this.render(this.pieces); }
  fadeTile(tile) { this.svg.dataset.animating = 'add'; this.animate(180, t => tile.visual.setAttribute('opacity', t), () => { tile.visual.removeAttribute('opacity'); this.svg.removeAttribute('data-animating'); }); }
  fadeLast(piece) {
    this.ghost = node('g', { 'aria-hidden': 'true', 'pointer-events': 'none' }); this.svg.append(this.ghost);
    const tile = this.makeTile(piece, true); this.ghost.append(tile.group); this.paint(tile, insetPolygon(piece.points, this.layout.distance));
    this.svg.dataset.animating = 'undo'; this.animate(160, t => tile.visual.setAttribute('opacity', 1 - t), () => { this.ghost?.remove(); this.ghost = null; this.svg.removeAttribute('data-animating'); });
  }
  animatePair(pair) {
    const { undo, original, children, seam } = pair, parentColor = ELEMENTS[original.activity.element].color;
    let targets;
    if (undo) {
      this.tiles.get(original.activity.id).visual.setAttribute('visibility', 'hidden');
      this.ghost = node('g', { 'aria-hidden': 'true', 'pointer-events': 'none' }); this.svg.append(this.ghost);
      targets = children.map(p => { const tile = this.makeTile(p, true); tile.symbolFit = symbolFit(insetPolygon(p.points, this.layout.distance), this.layout.unit); this.ghost.append(tile.group); return tile; });
    } else targets = children.map(p => this.tiles.get(p.activity.id));
    const duration = 440, u = this.layout.unit, intensity = this.settings.motion;
    this.svg.dataset.animating = undo ? 'undo' : 'split';
    this.animate(duration, t => {
      const phase = undo ? 1 - smooth(clamp(t / .84)) : smooth(clamp((t - .10) / .64));
      const shapes = transitionPolygons(pair, this.layout.distance, phase);
      const offsets = [];
      for (let i = 0; i < targets.length; i++) {
        const tile = targets[i], child = children[i];
        const colorPhase = undo ? 1 - smooth(clamp(t / .84)) : smooth(clamp(t / .40));
        const color = mixColor(parentColor, ELEMENTS[child.activity.element].color, colorPhase);
        const parentBounds = bounds(insetPolygon(original.points, this.layout.distance)), childBounds = bounds(insetPolygon(child.points, this.layout.distance));
        const lighting = Object.fromEntries(Object.keys(parentBounds).map(key => [key, parentBounds[key] + (childBounds[key] - parentBounds[key]) * phase]));
        const frosting = blendFrost(frostProfile(original.activity.id), frostProfile(child.activity.id), phase);
        this.paint(tile, shapes[i], color, seam, phase, 0, lighting, frosting);
        const c = center(child.points), dx = seam[1][0] - seam[0][0], dy = seam[1][1] - seam[0][1], length = Math.hypot(dx, dy);
        const side = Math.sign(dx * (c[1] - seam[0][1]) - dy * (c[0] - seam[0][0]));
        // Brief extra separation after the seam opens; all motion finishes at identity.
        const settle = undo ? 0 : Math.sin(Math.PI * clamp((t - .32) / .68)) * .65 * intensity * u;
        offsets.push([-dy / length * side * settle, dx / length * side * settle - settle * .3]);
        tile.visual.setAttribute('transform', `translate(${offsets[i]})`);
      }
      // Both child shadows sit below both faces, so a closed seam has no dark
      // line before it opens. Compensate for each child's separation movement.
      const underlay = targets[1].visual.querySelector('.tile-underlay');
      if (underlay) {
        underlay.setAttribute('transform', `translate(${offsets[1][0] - offsets[0][0]},${offsets[1][1] - offsets[0][1]})`);
        targets[0].visual.prepend(underlay);
      }
    }, () => {
      this.ghost?.remove(); this.ghost = null;
      for (const piece of this.pieces) { const tile = this.tiles.get(piece.activity.id); tile.visual.removeAttribute('visibility'); tile.visual.removeAttribute('transform'); this.paint(tile, this.layout.polygons.get(piece.activity.id)); }
      this.svg.removeAttribute('data-animating');
    });
  }
  point(event) { const p = this.svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; const matrix = this.svg.getScreenCTM(); if (!matrix) return [Infinity, Infinity]; const v = p.matrixTransform(matrix.inverse()); return [v.x, v.y]; }
  poseTile(tile, amount) {
    this.pose = amount;
    this.paint(tile, this.layout.polygons.get(tile.piece.activity.id), undefined, null, 1, amount);
  }
  press(id) {
    if (!this.tiles.has(id)) return;
    this.render(this.pieces); this.pressedId = id;
    const tile = this.tiles.get(id); tile.group.classList.add('is-pressed');
    if (this.motionEnabled()) this.animate(85, t => this.poseTile(tile, .18 + .82 * (1 - (1 - t) ** 3)));
  }
  settle(completeTap = false) {
    const id = this.pressedId, tile = this.tiles.get(id), pose = this.pose;
    // A second keyup/cancel must not stop a spring or a structural transition.
    if (!tile) return;
    this.stopTicks(); this.pressedId = null; this.gesture.cancel();
    tile.group.classList.remove('is-pressed');
    if (!this.motionEnabled()) { tile.visual.removeAttribute('transform'); return; }
    // Very quick taps can release before the first animation frame. Give those
    // a small readable response; scrolling/canceled presses simply return home.
    const attack = completeTap && pose < .65 ? 55 : 0, peak = attack ? .65 : pose;
    this.animate(260 + attack, t => {
      const elapsed = t * (260 + attack), spring = clamp((elapsed - attack) / 260);
      const amount = elapsed < attack ? pose + (peak - pose) * smooth(elapsed / attack) : peak * Math.exp(-7 * spring) * Math.cos(11 * spring);
      this.poseTile(tile, t === 1 ? 0 : amount);
    }, () => tile.visual.removeAttribute('transform'));
  }
  bindEvents() {
    this.svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) { if (this.pressedId !== null) this.settle(); return; }
      const id = Number(event.target.closest('.piece')?.dataset.id); if (!this.tiles.has(id)) return;
      this.press(id); this.gesture.start(id, event.pointerId, event.clientX, event.clientY);
      this.captureId = event.pointerId; try { this.svg.setPointerCapture(event.pointerId); } catch {}
    });
    window.addEventListener('pointermove', event => { if (this.gesture.move(event.pointerId, event.clientX, event.clientY)) this.settle(); }, { passive: true });
    window.addEventListener('pointerup', event => {
      const active = this.gesture.active; if (!active || active.pointerId !== event.pointerId) return;
      const id = this.gesture.release(event.pointerId, contains(this.tiles.get(active.id).piece.points, this.point(event)));
      this.settle(id !== null); if (id !== null) this.onSelect(id);
      if (this.captureId !== undefined) { try { this.svg.releasePointerCapture(this.captureId); } catch {} this.captureId = undefined; }
    });
    const cancelPress = () => { if (this.pressedId !== null) this.settle(); };
    window.addEventListener('pointercancel', cancelPress);
    this.svg.addEventListener('lostpointercapture', cancelPress);
    window.addEventListener('blur', () => this.render(this.pieces));
    window.addEventListener('scroll', cancelPress, { passive: true, capture: true });
    this.svg.addEventListener('click', event => { if (event.detail !== 0) return; const id = Number(event.target.closest('.piece')?.dataset.id); if (this.tiles.has(id)) this.onSelect(id); });
    this.svg.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); if (event.repeat) return;
      const id = Number(event.target.closest('.piece')?.dataset.id);
      if (this.tiles.has(id)) { this.press(id); this.onSelect(id); }
    });
    this.svg.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); this.settle(true); } });
    // Mouse-down changes focus after pointerdown. Do not cancel that new pointer
    // gesture when the previously focused tile emits focusout.
    this.svg.addEventListener('focusout', () => { if (!this.gesture.active) cancelPress(); });
  }
}
