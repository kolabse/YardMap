const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../js/geometry.js');
const viewport = require('../js/viewport.js');

test('viewport conversion round-trips negative and outside positions at zoom limits', () => {
    const state=viewport.createViewportState();const plot={width:20.5,length:35.75};
    for(const zoom of [0.25,1,8]) {
        state.zoom=zoom;state.panX=123;state.panY=-82;
        const view=viewport.viewForPlot(plot,650,500,state);
        const point={x:-4.125,y:40.25};
        const restored=geometry.toMetres(geometry.toScreen(point,view),view);
        assert.ok(Math.abs(restored.x-point.x)<1e-9);assert.ok(Math.abs(restored.y-point.y)<1e-9);
    }
    state.zoom=100;
    assert.equal(viewport.viewForPlot(plot,650,500,state).scale,geometry.createView(plot,650,500).scale*8);
});

test('snapping uses metre origin and handles fractional and negative coordinates', () => {
    assert.deepEqual(viewport.snapPoint({x:-1.26,y:2.24},0.5),{x:-1.5,y:2});
    assert.deepEqual(viewport.snapPoint({x:0.31,y:0.71},0.1),{x:0.3,y:0.7});
    for(const step of [0,-1,NaN,Infinity,0.001,1001])assert.throws(()=>viewport.validateGridStep(step));
});
