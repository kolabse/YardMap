const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');
const { analyzePlacement } = require('../js/placement.js');
const files = require('../js/project-file.js');
function garden() {
    const p = model.createProject(); model.setPlot(p,30,40);
    p.assessment = { territory:'gardening', sewer:'no', localRoadMinimum:3,
        lanes:{north:'two',east:'unknown',south:'unknown',west:'unknown'}, constraints:[] };
    return p;
}
function building(p,type,x,y,purpose=type,ownership='own') {
    const o = model.addObject(p,type,2,2); model.placeObject(p,o.id,x,y);
    o.assessment = { ownership,purpose,standalone:'yes',measurement:'wall',
        projections:{left:0,right:0,top:0,bottom:0},height:2,drainage:'own',attachedTo:null,windows:[] };
    return o;
}
const rule = (p,id) => analyzePlacement(p).checks.filter(c=>c.ruleId===id);
test('verified rules distinguish neighbor, road lanes and unknown border with exact minimum',()=>{
    const p=garden(); building(p,'house',3,4); p.plot.borders.west='neighbor';p.plot.borders.north='road';
    assert.equal(rule(p,'B01')[0]?.status,'pass');
    assert.equal(rule(p,'B04')[0]?.required,3);
    p.assessment.lanes.north='one'; assert.equal(rule(p,'B04')[0]?.required,4);
    p.objects[0].y=3.9;assert.equal(rule(p,'B04')[0]?.status,'violation');
    p.plot.borders.west='';assert.ok(rule(p,'B01').some(c=>c.status==='insufficient_data'));
});
test('projections at 0.5 use wall and larger projections change boundary distance',()=>{
    const p=garden(),o=building(p,'house',3,8);p.plot.borders.west='neighbor';
    o.assessment.projections.left=.5;assert.equal(rule(p,'B01')[0]?.status,'pass');
    o.assessment.projections.left=.6;assert.equal(rule(p,'B01')[0]?.actual,2.4);
    assert.equal(rule(p,'B01')[0]?.status,'violation');
    o.assessment.projections.left=null;assert.equal(rule(p,'B01')[0]?.status,'insufficient_data');
});
test('sanitary pairs are symmetric and distinguish own toilet from neighbor house with unknown sewer',()=>{
    const p=garden(),h=building(p,'house',3,10),t=building(p,'toilet',13,10,'outdoor_toilet');
    assert.equal(rule(p,'P01')[0]?.status,'pass');assert.equal(rule(p,'P01')[0]?.required,8);
    h.assessment.ownership='neighbor';h.x=-1;
    assert.equal(rule(p,'P04')[0]?.required,12);
    assert.equal(analyzePlacement(p).issues.filter(i=>i.kind==='outside').length,0);
    p.assessment.sewer='unknown';assert.equal(rule(p,'P04')[0]?.status,'insufficient_data');
    const before=rule(p,'P01')[0];p.objects.reverse();
    assert.deepEqual(rule(p,'P01')[0],before);
    h.assessment.ownership='own';t.assessment.purpose='biotoilet';
    assert.equal(rule(p,'P01').length,0);
});
test('well toilet uses 8 not legacy 12 and unresolved water safety remains pending',()=>{
    const p=garden();building(p,'well',3,10);building(p,'toilet',13,10,'outdoor_toilet');
    assert.equal(rule(p,'P02')[0]?.required,8);assert.equal(rule(p,'P02')[0]?.status,'pass');
    assert.ok(analyzePlacement(p).checks.some(c=>c.ruleId==='W01'&&c.status==='source_pending'));
});
test('legacy data never silently pass normative assessment and migration preserves unknowns',()=>{
    const p=garden();building(p,'house',3,4);delete p.assessment;delete p.objects[0].assessment;
    const restored=files.parseProject(JSON.stringify(p));
    assert.equal(restored.assessment?.territory,'unknown');
    assert.equal(restored.objects[0].assessment?.ownership,'unknown');
    assert.ok(analyzePlacement(restored).checks.some(c=>c.status==='insufficient_data'));
    assert.equal(analyzePlacement(restored).checks.filter(c=>c.status==='pass').length,0);
});
test('user line constraints remain independent of boundaries and retain category and source',()=>{
    const p=garden(),o=building(p,'house',3,4);
    p.assessment.constraints=[{id:'line-1',kind:'redline',name:'Мой отступ',x1:1,y1:0,x2:1,y2:40,minimum:3}];
    const c=rule(p,'U01')[0];assert.equal(c?.category,'user');assert.equal(c?.actual,2);assert.equal(c?.status,'violation');
    assert.deepEqual(c.objectIds,[o.id]);assert.equal(p.plot.width,30);
    assert.deepEqual(files.parseProject(files.serializeProject(p)),p);
});
test('normative metadata and references reject malformed values rather than dropping them',()=>{
    for(const mutate of [p=>p.assessment.lanes.north='three',p=>p.objects[0].assessment.height=-1,
        p=>p.objects[0].assessment.attachedTo='missing',p=>p.objects[0].assessment.projections.left=-1,
        p=>p.assessment.constraints=[{id:'x',kind:'redline',name:'x',x1:0,y1:0,x2:0,y2:0,minimum:2}]]) {
        const p=garden();building(p,'house',3,4);mutate(p);assert.throws(()=>files.serializeProject(p));
    }
});
test('adjacent veranda connection has its own result but accidental overlap still fails',()=>{
    const p=garden(),h=building(p,'house',3,4),v=building(p,'veranda',5,4);
    v.assessment.attachedTo=h.id;v.assessment.standalone='no';
    assert.ok(analyzePlacement(p).checks.some(c=>c.ruleId==='A01'&&c.status==='pass'));
    v.x=4.9;assert.ok(analyzePlacement(p).issues.some(c=>c.kind==='overlap'));
});
test('residential windows use point to neighboring wall, unknown windows remain incomplete',()=>{
    const p=garden(),h=building(p,'house',3,4),b=building(p,'shed',9,4,'outbuilding','neighbor');
    h.assessment.windows=[{x:2,y:1}];
    assert.equal(rule(p,'P03')[0]?.actual,4);assert.equal(rule(p,'P03')[0]?.status,'pass');
    b.x=8.9;assert.equal(rule(p,'P03')[0]?.status,'violation');
    h.assessment.windows=null;assert.equal(rule(p,'P03')[0]?.status,'insufficient_data');
});

test('neighbor toilet checks own house and garage road exception stays incomplete',()=>{
    const p=garden();building(p,'house',3,10);building(p,'toilet',13,10,'outdoor_toilet','neighbor');
    assert.equal(rule(p,'P04')[0]?.status,'violation');
    const q=garden();building(q,'garage',3,0,'garage');q.plot.borders.north='road';
    assert.equal(rule(q,'B04')[0]?.status,'insufficient_data');
});
test('open parking has no outbuilding setback and unknown neighbor purpose cannot pass window rule',()=>{
    const p=garden();building(p,'parking',0,4,'open_parking');p.plot.borders.west='neighbor';
    assert.equal(rule(p,'B02').length,0);
    const q=garden(),h=building(q,'house',3,4);h.assessment.windows=[{x:2,y:1}];
    building(q,'shed',9,4,'unknown','neighbor');
    assert.equal(rule(q,'P03')[0]?.status,'insufficient_data');
});

test('rotation invalidates world-side projections instead of reusing stale boundary measurements',()=>{
    const p=garden(),o=building(p,'house',3,4);o.assessment.projections.left=.6;
    model.updateObject(p,o.id,{rotation:90});
    assert.equal(o.assessment.projections.left,null);
    assert.ok(rule(p,'B01').every(c=>c.status==='insufficient_data'));
});

test('finite restriction segments measure diagonal crossings and endpoints',()=>{
    const {rectangleSegmentMeasurement:measure}=require('../js/geometry.js');
    const r={left:2,right:4,top:2,bottom:4};
    assert.equal(measure(r,{x1:0,y1:0,x2:6,y2:6}).distance,0);
    assert.equal(measure(r,{x1:0,y1:0,x2:1,y2:1}).distance,Math.sqrt(2));
    assert.equal(measure(r,{x1:0,y1:0,x2:0,y2:6}).distance,2);
});
