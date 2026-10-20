const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../theme.js'), 'utf8');
function setup({ saved = null, dark = false, blocked = false } = {}) {
  const events = {}, documentEvents = {}, buttonEvents = {}, attributes = {};
  const button = { hidden: true, setAttribute: (k,v) => attributes[k] = v, addEventListener: (k,f) => buttonEvents[k] = f };
  const system = { matches: dark, addEventListener: (_,f) => system.change = f };
  const storage = { value: saved, getItem() { if(blocked) throw Error(); return this.value; }, setItem(k,v) { if(blocked) throw Error(); this.value=v; } };
  const document = { documentElement: {dataset:{}}, addEventListener:(k,f)=>documentEvents[k]=f, querySelector:()=>button };
  vm.runInNewContext(source, {document, localStorage:storage, window:{matchMedia:()=>system, addEventListener:(k,f)=>events[k]=f}});
  return { document, system, storage, events, button, attributes, click:()=>buttonEvents.click(), ready:()=>documentEvents.DOMContentLoaded(), theme:()=>document.documentElement.dataset.theme };
}
test('first paint follows system; system changes stay live before a choice',()=>{
 for(const dark of [false,true]) { const p=setup({dark}); assert.equal(p.theme(),dark?'dark':'light'); p.ready(); assert.equal(p.button.hidden,false); p.system.matches=!dark; p.system.change(); assert.equal(p.theme(),dark?'light':'dark'); }
});
test('explicit choice persists across reload and overrides system changes',()=>{
 const p=setup(); p.ready(); p.click(); assert.equal(p.theme(),'dark'); assert.equal(p.attributes['aria-pressed'],'true'); assert.equal(p.storage.value,'dark'); p.system.change(); assert.equal(p.theme(),'dark');
 const reloaded=setup({saved:p.storage.value}); assert.equal(reloaded.theme(),'dark'); reloaded.ready(); reloaded.click(); assert.equal(reloaded.theme(),'light'); assert.equal(reloaded.attributes['aria-pressed'],'false'); assert.equal(reloaded.storage.value,'light');
});
test('invalid or denied storage does not break initialization or toggling',()=>{
 const invalid=setup({saved:'invalid',dark:true}); assert.equal(invalid.theme(),'dark');
 const blocked=setup({blocked:true}); blocked.ready(); blocked.click(); assert.equal(blocked.theme(),'dark');
});
test('cross-tab choice updates and clearing storage returns to system preference',()=>{
 const p=setup({saved:'light',dark:true}); p.ready(); p.events.storage({key:'jake-portfolio-theme',newValue:'dark'}); assert.equal(p.theme(),'dark'); p.events.storage({key:null,newValue:null}); assert.equal(p.theme(),'dark'); p.system.matches=false; p.system.change(); assert.equal(p.theme(),'light');
});
test('Back/Forward restoration reads a choice changed on another page',()=>{
 const p=setup({saved:'light'}); p.ready(); p.storage.value='dark'; p.events.pageshow(); assert.equal(p.theme(),'dark'); assert.equal(p.attributes['aria-pressed'],'true');
});
