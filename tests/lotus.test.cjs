const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname,'..');
test('all four shipped SVGs are byte-identical to the approved assets',()=>{
 const hashes=JSON.parse(fs.readFileSync(path.join(root,'assets/lotus/approved-sha256.json')));
 for(const [state,hash] of Object.entries(hashes)) {
  const bytes=fs.readFileSync(path.join(root,`assets/lotus/lotus-original-160-${state}.svg`));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
 }
});
test('lotus is decorative and only hover can reveal its echo',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
 assert.match(html, /<div class="lotus" aria-hidden="true">/);
 assert.doesNotMatch(html, /lotus\.js|lotus-help|Keep lotus/);
 assert.doesNotMatch(css, /\.lotus(?:\[aria-pressed|:focus)/);
 assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.lotus\[data-hover="true"\] \.lotus-echo/);
});
test('lotus mouse hover resets on leave; touch and click do nothing',()=>{
 const listeners={};const lotus={dataset:{},addEventListener:(k,f)=>listeners[k]=f};
 vm.runInNewContext(fs.readFileSync(path.join(root,'project-preview.js'),'utf8'),{document:{querySelectorAll:()=>[],querySelector:()=>lotus},window:{matchMedia:()=>({matches:true})}});
 listeners.pointerenter({pointerType:'mouse'});assert.equal(lotus.dataset.hover,'true');
 assert.equal(listeners.click,undefined);
 listeners.pointerleave();assert.equal(lotus.dataset.hover,'false');
 listeners.pointerenter({pointerType:'touch'});assert.equal(lotus.dataset.hover,'false');
});
