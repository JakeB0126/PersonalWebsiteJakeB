import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, inkFor } from '../../projects/attune/mosaic/palettes.js';
import { SYMBOLS } from '../../projects/attune/mosaic/symbols.js';

const luminance = hex => {
  const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return .2126*r + .7152*g + .0722*b;
};
test('paired palettes match sampled source RGBs, prepaint backgrounds and non-text symbol contrast', () => {
  assert.deepEqual(PALETTES.light, {background:'#FFFCF0',colors:{fire:'#D91816',earth:'#749020',water:'#0079C7',air:'#DDA801'}});
  assert.deepEqual(PALETTES.dark, {background:'#262626',colors:{fire:'#D36341',earth:'#8BA74B',water:'#439C96',air:'#E9DF6F'}});
  const css = readFileSync(new URL('../../projects/attune/mosaic/styles.css',import.meta.url),'utf8');
  const html = readFileSync(new URL('../../projects/attune/mosaic/index.html',import.meta.url),'utf8');
  for (const [theme,palette] of Object.entries(PALETTES)) {
    assert.ok(css.includes(palette.background)); assert.ok(html.includes(palette.background));
    for (const [element,color] of Object.entries(palette.colors)) {
      assert.ok(css.includes(color));
      const a=luminance(color),b=luminance(inkFor(element,{darkMode:theme==='dark'}));
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3, `${theme} ${element} symbol contrast`);
    }
  }
});
test('tile glyphs retain every authentic vector path and original hollow circle', () => {
  for (const [element,symbol] of Object.entries(SYMBOLS)) {
    const source=readFileSync(new URL(`../../projects/attune/assets/${element}.svg`,import.meta.url),'utf8');
    const paths=[...source.matchAll(/<path[^>]+ d="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(symbol.paths,paths);
    const circle=source.match(/<circle[^>]+>/)[0];
    for (const [key,value] of Object.entries(symbol.circle)) assert.equal(Number(circle.match(new RegExp(`${key}="([^"]+)"`))[1]),value);
  }
});
