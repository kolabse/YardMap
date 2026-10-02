const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../js/geometry.js');
const model = require('../js/model.js');

// Characterization of the extracted API; the pre-change behaviour regressions
// and the observed red-to-green cycle are in editor.test.js.
test('screen conversions round-trip metre positions at different scales', () => {
    for (const size of [[650, 500], [900, 800], [300, 500]]) {
        const view = geometry.createView({ width: 20, length: 35 }, ...size);
        const point = { x: 3.25, y: -1.75 };
        const result = geometry.toMetres(geometry.toScreen(point, view), view);
        assert.ok(Math.abs(result.x - point.x) < 1e-12);
        assert.ok(Math.abs(result.y - point.y) < 1e-12);
    }
});

test('distance is symmetric and measured between rectangle edges', () => {
    const a = { left: 0, top: 0, right: 5, bottom: 6 };
    const b = { left: 8, top: 10, right: 9, bottom: 11 };
    assert.equal(geometry.rectangleDistance(a, b), 5);
    assert.equal(geometry.rectangleDistance(b, a), 5);
    assert.equal(geometry.rectangleDistance(a, { left: 5, top: 0, right: 6, bottom: 1 }), 0);
    assert.equal(geometry.rectangleDistance(a, { left: 1, top: 1, right: 2, bottom: 2 }), 0);
});

test('plot distances use object orientation and retain negative outside offsets', () => {
    const object = { x: -0.5, y: 4, width: 5, length: 6, rotation: 90 };
    assert.deepEqual(geometry.objectSize(object), { width: 6, length: 5 });
    assert.deepEqual(geometry.borderDistances({ width: 20, length: 35 }, object),
        { left: -0.5, right: 14.5, top: 4, bottom: 26 });
});

test('failed additions preserve model and object ID sequence', () => {
    const project = model.createProject(); model.setPlot(project, 20, 35);
    for (const bad of [NaN, Infinity, 0, -1]) {
        assert.throws(() => model.addObject(project, 'house', bad, 6), RangeError);
        assert.throws(() => model.setPlot(project, 20, bad), RangeError);
    }
    assert.equal(project.objects.length, 0);
    assert.equal(project.nextObjectId, 1);
    assert.equal(project.plot.length, 35);
    assert.equal(model.addObject(project, 'house', 5.25, 6).id, 'object-1');
});

test('plot changes preserve metre geometry, IDs, borders and waiting state', () => {
    const project = model.createProject(); model.setPlot(project, 20, 35);
    model.setBorder(project, 'north', 'road');
    const placed = model.addObject(project, 'house', 5, 6);
    const waiting = model.addObject(project, 'well', 1, 1);
    model.placeObject(project, placed.id, 3.25, 4.75);
    model.setPlot(project, 40.5, 70);
    assert.equal(project.plot.borders.north, 'road');
    assert.equal(placed.x, 3.25); assert.equal(placed.y, 4.75);
    assert.equal(waiting.status, 'waiting'); assert.equal(waiting.x, null);
    model.returnToWaiting(project, placed.id);
    assert.equal(placed.status, 'waiting'); assert.equal(placed.x, null); assert.equal(placed.y, null);
    assert.notEqual(placed.id, waiting.id);
});
