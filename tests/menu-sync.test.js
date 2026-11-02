const test=require('node:test'),assert=require('node:assert');
const {syncNewSourceItems}=require('../menu-sync.js');
const src=[{id:1,n:'A',c:'X',cents:100},{id:2,n:'B',c:'X',cents:200},{id:310,n:'Kid',c:'Kindergerichte',cents:799,img:'assets/k.png'}];
const mk=()=>({categories:[{id:'c1',name:'X',sortOrder:0}],products:[{id:'menu_1',sourceId:1,name:'A',priceCents:555,sortOrder:0},{id:'menu_5',sourceId:5,name:'E',priceCents:1,sortOrder:1}],settings:{}});
test('adds missing items incl. lower ids, keeps existing untouched',()=>{
  const d=mk(),r=syncNewSourceItems(d,src);
  assert.equal(r.added,2);
  assert.equal(d.products.length,4);
  assert.equal(d.products[0].priceCents,555);
  const k=d.products.find(p=>p.sourceId===310);
  assert.equal(k.priceCents,799);assert.equal(d.categories.find(c=>c.id===k.categoryId).name,'Kindergerichte');
  assert.ok(d.products.some(p=>p.sourceId===2));
});
test('second run adds nothing; deleted item is not re-added',()=>{
  const d=mk();syncNewSourceItems(d,src);
  d.products=d.products.filter(p=>p.sourceId!==310);
  const r=syncNewSourceItems(d,src);
  assert.equal(r.added,0);assert.equal(r.changed,false);assert.equal(d.products.length,3);
});
test('state from the earlier sync version is re-evaluated once',()=>{
  const d=mk();d.settings.menuSyncedSourceIds=['1','5','2','310'];
  const r=syncNewSourceItems(d,src);
  assert.ok(d.products.some(p=>p.sourceId===310));assert.equal(d.settings.menuSyncVersion,2);
});
test('later new source item gets added',()=>{
  const d=mk();syncNewSourceItems(d,src);
  const r=syncNewSourceItems(d,[...src,{id:311,n:'M',c:'Kindergerichte',cents:699}]);
  assert.equal(r.added,1);assert.equal(d.categories.filter(c=>c.name==='Kindergerichte').length,1);
});
