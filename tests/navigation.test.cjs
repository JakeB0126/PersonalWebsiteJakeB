const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../navigation.js'), 'utf8');
function setup(path='/') {
 const events={}, headerEvents={}, documentEvents={};
 const location=new URL('http://localhost:4174'+path);
 const links=['./','about.html','assets/resume/Jake_Biondolillo_PD.pdf','./#contact'].map(href=>{
  const url=new URL(href,location);const attrs={};
  return {hash:url.hash,pathname:url.pathname,attrs,setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],focus(){document.activeElement=this;}};
 });
 const label={},symbol={},toggleEvents={},attrs={};
 const toggle={hidden:true,setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k],querySelector:s=>s==='[data-menu-label]'?label:symbol,addEventListener:(k,f)=>toggleEvents[k]=f,focus(){document.activeElement=this;}};
 const nav={querySelectorAll:()=>links,contains:el=>links.includes(el)};
 const header={querySelector:s=>s==='.menu-toggle'?toggle:nav,addEventListener:(k,f)=>headerEvents[k]=f,contains:el=>el===toggle||links.includes(el)};
 const focused=[];
 const document={activeElement:null,querySelector:()=>header,addEventListener:(k,f)=>documentEvents[k]=f,getElementById:id=>({focus:()=>focused.push(id)})};
 const media={matches:true,addEventListener:()=>{}};
 vm.runInNewContext(source,{window:{location,matchMedia:()=>media,addEventListener:(k,f)=>events[k]=f},document});
 return {links,nav,attrs,toggleEvents,headerEvents,events,location,document,toggle,focused};
}
test('correct page state for home, explicit index, and About direct loads',()=>{
 for(const [path,index] of [['/',0],['/index.html',0],['/about.html',1]]) {
  const p=setup(path); assert.equal(p.links[index].attrs['aria-current'],'page'); assert.equal(p.links.filter(l=>l.attrs['aria-current']).length,1);
 }
});
test('Contact fragment and history restoration update active state',()=>{
 const p=setup('/#contact');assert.equal(p.links[3].attrs['aria-current'],'location');p.location.hash='';p.events.hashchange();assert.equal(p.links[0].attrs['aria-current'],'page');p.location.hash='#resume';p.events.pageshow();assert.equal(p.links[0].attrs['aria-current'],'page');
});
test('mobile menu closes for cross-page links without focusing a foreign fragment',()=>{
 const p=setup('/about.html');p.toggleEvents.click();assert.equal(p.nav.hidden,false);
 p.headerEvents.click({target:{closest:()=>p.links[3]}});assert.equal(p.nav.hidden,true);assert.deepEqual(p.focused,[]);
});
test('same-page Contact focuses target; Escape closes and restores menu focus',()=>{
 const p=setup('/');p.headerEvents.click({target:{closest:()=>p.links[3]}});assert.deepEqual(p.focused,['contact']);p.toggleEvents.click();p.headerEvents.keydown({key:'Escape',preventDefault(){}});assert.equal(p.nav.hidden,true);assert.equal(p.document.activeElement,p.toggle);
});

test('direct PDF link closes mobile menu without fragment focus or navigation interception',()=>{
 const p=setup('/');p.toggleEvents.click();p.headerEvents.click({target:{closest:()=>p.links[2]}});assert.equal(p.nav.hidden,true);assert.deepEqual(p.focused,[]);
});
