const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../js/model.js'),g=require('../js/geometry.js'),f=require('../js/project-file.js');
const {analyzePlacement}=require('../js/placement.js');
const {definitions}=require('../js/catalog.js');
function plot(){const p=m.createProject();m.setPlot(p,20,20);return p;}
test('catalog includes grouped garden, route and utility objects with appropriate geometry',()=>{
 for(const type of ['bed','greenhouse','tree','path','gate','septic','communication'])assert.ok(definitions[type],type);
 const p=plot(),tree=m.addObject(p,'tree',4,4),line=m.addObject(p,'communication',5,2);
 assert.deepEqual(tree.geometry,{kind:'circle',radius:2});assert.equal(line.geometry.kind,'line');
 assert.ok(definitions.bed.category);assert.equal(definitions.tree.shape,'circle');
});
test('circle anchor is trunk, crown has a separate extent and line endpoints rotate',()=>{
 const p=plot(),tree=m.addObject(p,'tree',4,4);m.placeObject(p,tree.id,3,5);
 assert.deepEqual(g.objectRect(tree),{left:1,right:5,top:3,bottom:7});
 const line=m.addObject(p,'communication',5,2);m.updateObject(p,line.id,{geometry:{kind:'line',dx:-4,dy:3},rotation:90});m.placeObject(p,line.id,8,5);
 assert.deepEqual(g.objectRect(line),{left:5,right:8,top:1,bottom:5});
 assert.deepEqual(f.parseProject(f.serializeProject(p)),p);
});
test('new shapes validate atomically, copy independently and retain legacy rectangles',()=>{
 const p=plot(),t=m.addObject(p,'tree',4,4);const before=f.serializeProject(p);
 assert.throws(()=>m.updateObject(p,t.id,{geometry:{kind:'circle',radius:-1}}));assert.equal(f.serializeProject(p),before);
 const c=m.copyObject(p,t.id);m.updateObject(p,c.id,{width:6,length:6});assert.equal(c.geometry.radius,3);assert.equal(t.geometry.radius,2);
 const l=m.addObject(p,'communication',2,2);assert.throws(()=>m.updateObject(p,l.id,{geometry:{kind:'line',dx:0,dy:0}}));
 const bad=JSON.parse(f.serializeProject(p));bad.objects[0].geometry.kind='line';assert.throws(()=>f.parseProject(JSON.stringify(bad)));
 const old=m.addObject(p,'house',2,3);assert.equal(g.objectRect({...old,x:1,y:2}).right,3);
});
test('area summary clips to plot, excludes waiting and neighbors, and counts overlapping zones once',()=>{
 const p=plot(),a=m.addObject(p,'bed',4,4),b=m.addObject(p,'path',4,4);m.placeObject(p,a.id,0,0);m.placeObject(p,b.id,2,0);
 m.addObject(p,'greenhouse',3,3);const n=m.addObject(p,'house',4,4);m.placeObject(p,n.id,10,0);n.assessment.ownership='neighbor';
 const areas=g.areaSummary(p);assert.equal(areas.plot,400);assert.equal(areas.sotkas,4);assert.equal(areas.covered,24);assert.equal(areas.percent,6);assert.equal(areas.categories.garden,16);
 b.x=-2;assert.equal(g.areaSummary(p).covered,16);
});
test('circle coverage follows crown rather than its bounding square and lines occupy zero area',()=>{
 const p=plot(),t=m.addObject(p,'tree',4,4);m.placeObject(p,t.id,5,5);const l=m.addObject(p,'communication',10,10);m.placeObject(p,l.id,0,0);
 assert.ok(Math.abs(g.areaSummary(p).covered-4*Math.PI)<.001);
 t.x=0;assert.ok(Math.abs(g.areaSummary(p).covered-2*Math.PI)<.001);
});
test('communication and crown overlays are allowed but solid building overlaps still fail',()=>{
 const p=plot(),h=m.addObject(p,'house',4,4),l=m.addObject(p,'communication',10,10),t=m.addObject(p,'tree',6,6);m.placeObject(p,h.id,2,2);m.placeObject(p,l.id,0,4);m.placeObject(p,t.id,4,4);
 assert.equal(analyzePlacement(p).issues.filter(i=>i.kind==='overlap').length,0);
 const b=m.addObject(p,'greenhouse',4,4);m.placeObject(p,b.id,3,3);assert.equal(analyzePlacement(p).issues.filter(i=>i.kind==='overlap').length,1);
});
test('tree setback is measured from trunk and requires explicit mature category',()=>{
 const p=plot(),t=m.addObject(p,'tree',8,8);m.placeObject(p,t.id,4,8);p.plot.borders.west='neighbor';p.assessment.territory='gardening';t.assessment.ownership='own';
 let checks=()=>analyzePlacement(p).checks.filter(c=>c.ruleId==='B03');
 assert.equal(checks()[0]?.status,'insufficient_data');m.updateObject(p,t.id,{assessment:{...t.assessment,treeClass:'high'}});
 assert.equal(checks()[0]?.actual,4);assert.equal(checks()[0]?.required,4);assert.equal(checks()[0]?.status,'pass');
 t.x=3.9;assert.equal(checks()[0]?.status,'violation');
});

test('new-shape import requires geometry and rejects inconsistent extent, compost retains water-distance rule',()=>{
 const p=plot(),t=m.addObject(p,'tree',4,4),data=JSON.parse(f.serializeProject(p));delete data.objects[0].geometry;
 assert.throws(()=>f.parseProject(JSON.stringify(data)));
 data.objects[0].geometry={kind:'circle',radius:3};assert.throws(()=>f.parseProject(JSON.stringify(data)));
 assert.throws(()=>m.updateObject(p,t.id,{length:-1}));
 const q=plot(),w=m.addObject(q,'well',2,2),c=m.addObject(q,'compost',2,2);m.placeObject(q,w.id,2,5);m.placeObject(q,c.id,11,5);
 q.assessment.territory='gardening';for(const o of q.objects)Object.assign(o.assessment,{purpose:o.type,ownership:'own',measurement:'wall'});
 assert.equal(analyzePlacement(q).checks.find(x=>x.ruleId==='P02')?.status,'violation');
});

test('overlapping crowns and solid-zone mixtures have analytic union area within displayed precision',()=>{
 const p=plot(),a=m.addObject(p,'tree',4,4),b=m.addObject(p,'tree',4,4);m.placeObject(p,a.id,6,6);m.placeObject(p,b.id,8,6);
 const overlap=8*Math.acos(.5)-Math.sqrt(12);
 assert.ok(Math.abs(g.areaSummary(p).covered-(8*Math.PI-overlap))<.001);
 b.x=a.x;assert.ok(Math.abs(g.areaSummary(p).covered-4*Math.PI)<.001);
 const zone=m.addObject(p,'bed',4,4);m.placeObject(p,zone.id,4,4);assert.ok(Math.abs(g.areaSummary(p).covered-16)<.001);
});
test('new sanitary conditions remain specific to confirmed system kind and source availability',()=>{
 const p=plot(),s=m.addObject(p,'septic',2,2);m.placeObject(p,s.id,1,5);p.assessment.territory='gardening';p.plot.borders.west='neighbor';
 Object.assign(s.assessment,{purpose:'septic',ownership:'own',measurement:'wall'});
 const check=()=>analyzePlacement(p).checks.find(c=>c.ruleId==='S02'&&c.side==='left');
 assert.equal(check().status,'insufficient_data');s.assessment.septicKind='septic';assert.equal(check().required,1);assert.equal(check().status,'pass');
 s.assessment.septicKind='pit';assert.equal(check().required,2);assert.equal(check().status,'violation');
 assert.ok(analyzePlacement(p).checks.some(c=>c.ruleId==='W01'&&c.status==='source_pending'));
});

test('shape purpose cannot masquerade as a house and windows or attachments require building contours',()=>{
 const p=plot(),t=m.addObject(p,'tree',4,4),line=m.addObject(p,'communication',3,3),h=m.addObject(p,'house',3,3);
 assert.throws(()=>m.updateObject(p,t.id,{assessment:{...t.assessment,purpose:'house'}}));
 assert.throws(()=>m.updateObject(p,line.id,{assessment:{...line.assessment,windows:[{x:0,y:0}]}}));
 assert.throws(()=>m.updateObject(p,h.id,{assessment:{...h.assessment,purpose:'tree'}}));
 assert.throws(()=>m.updateObject(p,line.id,{assessment:{...line.assessment,attachedTo:h.id}}));
});
