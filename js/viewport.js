(() => {
    const geometry = typeof module !== 'undefined' && module.exports ? require('./geometry.js') : globalThis.YardMap;
    const minZoom = 0.25, maxZoom = 8;
    function createViewportState() {
        return { zoom: 1, panX: 0, panY: 0, gridVisible: true, snapEnabled: false, step: 1, panMode: false };
    }
    function validateGridStep(step) {
        if (!Number.isFinite(step) || step < 0.01 || step > 1000) throw new RangeError('Шаг сетки: от 0.01 до 1000 м.');
    }
    function viewForPlot(plot, width, height, state) {
        const base = geometry.createView(plot, width, height);
        const zoom = Math.max(minZoom, Math.min(maxZoom, state.zoom));
        return { scale: base.scale * zoom,
            left: width / 2 + (base.left - width / 2) * zoom + state.panX,
            top: height / 2 + (base.top - height / 2) * zoom + state.panY };
    }
    function snapPoint(point, step) {
        validateGridStep(step);
        return { x: Number((Math.round(point.x / step) * step).toPrecision(15)),
            y: Number((Math.round(point.y / step) * step).toPrecision(15)) };
    }
    const api = { createViewportState, validateGridStep, viewForPlot, snapPoint, minZoom, maxZoom };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
