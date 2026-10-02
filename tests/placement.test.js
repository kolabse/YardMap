const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../js/geometry.js');
const { analyzePlacement } = require('../js/placement.js');
const model = require('../js/model.js');

// Characterization of the extracted checker. Test-first regression evidence
// for the user-visible behaviour remains in editor.test.js.
test('closest points are on contours and reverse symmetrically for diagonal and horizontal gaps', () => {
    const a = { left: 0, top: 0, right: 5, bottom: 6 };
    for (const b of [{left:8,top:10,right:9,bottom:11}, {left:8,top:2,right:9,bottom:4}]) {
        const ab = geometry.rectangleMeasurement(a,b), ba = geometry.rectangleMeasurement(b,a);
        assert.deepEqual(ab.start, ba.end); assert.deepEqual(ab.end, ba.start);
        assert.equal(ab.distance, geometry.rectangleDistance(a,b));
        assert.equal(ab.relation, 'separated');
        assert.equal(ab.start.x, a.right); assert.equal(ab.end.x, b.left);
    }
});

test('contact, containment and overlap have separate geometric relations', () => {
    const a = { left: 0, top: 0, right: 5, bottom: 6 };
    for (const b of [{left:5,top:1,right:6,bottom:2}, {left:5,top:6,right:6,bottom:7}]) {
        assert.equal(geometry.rectangleMeasurement(a,b).relation, 'touching');
    }
    const inside = {left:1,top:1,right:2,bottom:2};
    const measurement = geometry.rectangleMeasurement(a,inside);
    assert.equal(measurement.relation, 'overlap'); assert.equal(measurement.distance, 0);
    assert.deepEqual(measurement.start, measurement.end);
});

test('checker preserves model, emits each pair once and excludes waiting objects', () => {
    const project = model.createProject(); model.setPlot(project,20,35);
    const a = model.addObject(project,'house',5,6), b = model.addObject(project,'parking',2,2);
    model.addObject(project,'toilet',1,1);
    model.placeObject(project,a.id,3,4); model.placeObject(project,b.id,4,5);
    const before = JSON.stringify(project), result = analyzePlacement(project);
    assert.equal(JSON.stringify(project), before);
    assert.equal(result.checkedObjects,2); assert.equal(result.pairs.length,1);
    assert.equal(result.issues.filter(issue=>issue.kind==='overlap').length,1);
    assert.equal(result.issues.filter(issue=>issue.kind==='object-gap').length,0);
    assert.equal(result.invalidObjectIds.size,2);
});

test('rotated footprint and multiple crossed plot sides are reported on one object', () => {
    const project = model.createProject(); model.setPlot(project,20,35);
    const a = model.addObject(project,'house',5,6);
    model.placeObject(project,a.id,14.5,30.5); a.rotation=90;
    const result = analyzePlacement(project);
    const outside=result.issues.filter(issue=>issue.kind==='outside');
    assert.equal(outside.length,1); assert.deepEqual(outside[0].sides,['right','bottom']);
});

test('round-off at contact and preliminary thresholds does not create spurious issues', () => {
    const project = model.createProject(); model.setPlot(project,20,35);
    const a = model.addObject(project,'house',5,6), b = model.addObject(project,'house',5,6);
    model.placeObject(project,a.id,3-1e-10,4); model.placeObject(project,b.id,11-1e-10,4);
    assert.equal(analyzePlacement(project).issues.length,0);
    b.type='parking'; b.width=2; b.length=2; b.x=8-1e-10;
    const result=analyzePlacement(project);
    assert.equal(result.contacts,1); assert.equal(result.issues.length,0);
});
