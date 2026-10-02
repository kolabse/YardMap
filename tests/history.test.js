const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory } = require('../js/history.js');

test('history snapshots remain independent of input and returned data', () => {
    const history=createHistory();const project={objects:[{x:1}]};
    history.reset(project);project.objects[0].x=2;history.record(project);
    const previous=history.undo();previous.objects[0].x=99;
    assert.deepEqual(history.redo(),{objects:[{x:2}]});
    assert.deepEqual(history.undo(),{objects:[{x:1}]});
});

test('history bounds undo memory, keeps no-op redo and resets both directions', () => {
    const history=createHistory(2);history.reset({x:0});
    for(let x=1;x<=3;x++)history.record({x});
    assert.deepEqual(history.counts(),{undo:2,redo:0});
    assert.deepEqual(history.undo(),{x:2});
    history.record({x:2});assert.deepEqual(history.counts(),{undo:1,redo:1});
    assert.deepEqual(history.undo(),{x:1});assert.equal(history.undo(),null);
    history.reset({x:10});assert.deepEqual(history.counts(),{undo:0,redo:0});
    assert.equal(history.redo(),null);
    assert.throws(()=>createHistory(0));
});
