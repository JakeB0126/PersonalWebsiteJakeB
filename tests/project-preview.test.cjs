const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(fine = true) {
 const listeners = {}, screenAttrs = {};
 const cover = { hidden: true, addEventListener: (k,f) => listeners[k]=f };
 const screens = { setAttribute: (k,v) => screenAttrs[k]=v };
 const preview = { dataset: {}, querySelector: s => s.includes('toggle') ? cover : screens };
 vm.runInNewContext(fs.readFileSync('project-preview.js','utf8'), { document: { querySelectorAll: () => [preview], querySelector: () => null }, window: { matchMedia: () => ({matches:fine}) } });
 return { fire: (k,e={pointerType:'mouse'}) => listeners[k]?.(e), listeners, screenAttrs, preview };
}
test('mouse enters to reveal; click cannot pin; mouse leaves to restore', () => {
 const p=setup(); assert.equal(p.preview.dataset.preview,'false');
 p.fire('pointerenter'); assert.equal(p.screenAttrs['aria-hidden'],'false');
 p.fire('click'); assert.equal(p.preview.dataset.preview,'true');
 p.fire('pointerleave'); assert.equal(p.preview.dataset.preview,'false');
 p.fire('click'); p.fire('focus'); assert.equal(p.preview.dataset.preview,'false');
 assert.deepEqual(Object.keys(p.listeners).sort(), ['pointerenter','pointerleave']);
});
test('touch and hybrid-device touch leave the resting image unchanged', () => {
 for(const fine of [false,true]) {
  const p=setup(fine); p.fire('pointerenter',{pointerType:'touch'}); p.fire('click');
  assert.equal(p.preview.dataset.preview,'false');
 }
});
test('image objects have no button or link semantics; project-title links remain', () => {
 const html=fs.readFileSync('index.html','utf8');
 assert.doesNotMatch(html, /<button class="(?:lotus|proggy-preview-toggle|cover-preview-toggle)"/);
 assert.equal((html.match(/<div class="(?:proggy-preview-toggle|cover-preview-toggle)" hidden>/g)||[]).length,5);
 assert.match(html, /id="compendium-title"><a href="projects\/spellcasters-compendium\/"/);
});
