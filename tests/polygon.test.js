const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../js/model'),g=require('../js/geometry'),f=require('../js/project-file');
const {analyzePlacement}=require('../js/placement');
function vertices(points){return points.map(([x,y],i)=>({id:'vertex-'+(i+1),x,y,border:'',lanes:'unknown',minimum:null}));}
function polygon(points){const p=m.createProject();m.setPolygon(p,vertices(points));return p;}
const notch=[[0,0],[10,0],[10,10],[7,10],[7,3],[3,3],[3,10],[0,10]];
test('polygon model creates a trapezoid with edge lengths, true area and version two round trip',()=>{
 const p=polygon([[0,0],[10,0],[8,6],[2,6]]);assert.equal(p.version,2);assert.equal(p.plot.kind,'polygon');
 assert.equal(g.areaSummary(p).plot,48);assert.equal(g.plotEdges(p.plot)[1].length,Math.sqrt(40));
 assert.deepEqual(f.parseProject(f.serializeProject(p)),p);
});
test('polygon validation rejects crossings, repeated points, collinear rings and touching nonadjacent edges atomically',()=>{
 assert.equal(typeof m.setPolygon,'function');
 const p=m.createProject();m.setPlot(p,10,10);const before=f.serializeProject(p);
 for(const points of [[[0,0],[10,10],[0,10],[10,0]],[[0,0],[5,0],[10,0]],[[0,0],[10,0],[10,10],[0,0]],[[0,0],[10,0],[5,0],[5,5],[0,5]]]){
  assert.throws(()=>m.setPolygon(p,vertices(points)));assert.equal(f.serializeProject(p),before);
 }
});
test('concave plot rejects rectangle bridging a notch even with every corner inside',()=>{
 const p=polygon(notch),o=m.addObject(p,'house',8,2);m.placeObject(p,o.id,1,7);
 assert.equal(g.isInsidePlot(p.plot,o),false);assert.ok(analyzePlacement(p).issues.some(i=>i.kind==='outside'));
 m.updateObject(p,o.id,{width:2,length:2});assert.equal(g.isInsidePlot(p.plot,o),true);
 const l=m.addObject(p,'communication',8,2);m.updateObject(p,l.id,{geometry:{kind:'line',dx:8,dy:0}});m.placeObject(p,l.id,1,8);
 assert.equal(g.isInsidePlot(p.plot,l),false);
});
test('polygon coverage clips concavity and slope without counting its bounding rectangle',()=>{
 const p=polygon(notch),o=m.addObject(p,'bed',10,10);m.placeObject(p,o.id,0,0);assert.equal(g.areaSummary(p).covered,72);
 const q=polygon([[0,0],[10,0],[8,6],[2,6]]),b=m.addObject(q,'bed',10,6);m.placeObject(q,b.id,0,0);
 assert.equal(g.areaSummary(q).covered,48);assert.equal(g.areaSummary(q).percent,100);
 const r=polygon([[0,0],[10,0],[0,10]]),t=m.addObject(r,'tree',4,4);m.placeObject(r,t.id,5,5);
 assert.ok(Math.abs(g.areaSummary(r).covered-2*Math.PI)<.001);
});
test('side-specific rules measure nearest contour points and distinguish user thresholds from road rules',()=>{
 const p=polygon([[0,0],[20,0],[20,20],[0,20]]);p.assessment.territory='gardening';p.assessment.localRoadMinimum=3;
 p.plot.vertices[0].border='road';p.plot.vertices[0].lanes='one';p.plot.vertices[3].border='neighbor';p.plot.vertices[3].minimum=5;
 const o=m.addObject(p,'house',2,2);m.placeObject(p,o.id,3,3);Object.assign(o.assessment,{ownership:'own',purpose:'house',measurement:'wall',projections:{left:0,right:0,top:0,bottom:0}});
 const checks=()=>analyzePlacement(p).checks;
 assert.equal(checks().find(c=>c.ruleId==='B04')?.required,4);assert.equal(checks().find(c=>c.ruleId==='B04')?.status,'violation');
 const own=checks().find(c=>c.category==='user'&&c.edgeId==='vertex-4');assert.equal(own?.actual,3);assert.equal(own?.required,5);
 const west=checks().find(c=>c.ruleId==='B01'&&c.edgeId==='vertex-4');assert.equal(west?.status,'pass');
 p.plot.vertices[3].x=1;assert.equal(checks().find(c=>c.ruleId==='B01'&&c.edgeId==='vertex-4')?.status,'violation');
});
test('legacy rectangle is preserved while mixed polygon collections survive import and cloning',()=>{
 const old=m.createProject();m.setPlot(old,20,35);assert.equal(f.parseProject(f.serializeProject(old)).version,1);
 const p=polygon(notch);const bad=JSON.parse(f.serializeProject(p));bad.plot.vertices[0].border='bad';assert.throws(()=>f.parseProject(JSON.stringify(bad)));
 bad.plot.vertices[0].border='';bad.plot.width=99;assert.throws(()=>f.parseProject(JSON.stringify(bad)));
 const {cloneProject}=require('../js/variants');assert.deepEqual(cloneProject(p),p);
 m.setPlot(p,20,35);assert.equal(p.plot.kind,'rectangle');assert.equal(f.parseProject(f.serializeProject(p)).version,2);
});
