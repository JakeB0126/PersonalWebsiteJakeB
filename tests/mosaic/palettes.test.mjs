import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES } from '../../projects/attune/mosaic/palettes.js';

test('paired palettes retain sampled source RGBs and prepaint backgrounds', () => {
  assert.deepEqual(PALETTES.light, {background:'#FFFCF0',colors:{fire:'#D91816',earth:'#749020',water:'#0079C7',air:'#DDA801'}});
  assert.deepEqual(PALETTES.dark, {background:'#262626',colors:{fire:'#D36341',earth:'#8BA74B',water:'#439C96',air:'#E9DF6F'}});
  const css = readFileSync(new URL('../../projects/attune/mosaic/styles.css',import.meta.url),'utf8');
  const html = readFileSync(new URL('../../projects/attune/mosaic/index.html',import.meta.url),'utf8');
  for (const [theme,palette] of Object.entries(PALETTES)) {
    assert.ok(css.includes(palette.background)); assert.ok(html.includes(palette.background));
    for (const [element,color] of Object.entries(palette.colors)) {
      assert.ok(css.includes(color));

    }
  }
});
test('mosaic UI and runtime offer no icons or Flat option', () => {
 const base='../../projects/attune/mosaic/';
 const html=readFileSync(new URL(base+'index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL(base+'app.js',import.meta.url),'utf8');
 const renderer=readFileSync(new URL(base+'renderer.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/show-icons|value="flat"|Show icons/);
 assert.deepEqual([...html.matchAll(/name="finish" value="([^"]+)"/g)].map(m=>m[1]),['frosted','glass']);
 assert.doesNotMatch(app,/show-icons|createSymbol|legend-symbol/);
 assert.doesNotMatch(renderer,/createSymbol|showIcons|symbolFit|tile-symbol/);
});
