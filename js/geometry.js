(() => {
    // Metres are the only units here, except at the explicit view boundary.
    function objectSize(object) {
        const swapped = Math.abs(object.rotation % 180) === 90;
        return swapped ? { width: object.length, length: object.width }
            : { width: object.width, length: object.length };
    }
    function objectRect(object) {
        const size = objectSize(object);
        return { left: object.x, top: object.y, right: object.x + size.width, bottom: object.y + size.length };
    }
    function borderDistances(plot, object) {
        const rect = objectRect(object);
        return { left: rect.left, right: plot.width - rect.right, top: rect.top, bottom: plot.length - rect.bottom };
    }
    function rectangleDistance(a, b) {
        const dx = Math.max(a.left - b.right, b.left - a.right, 0);
        const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
        return Math.hypot(dx, dy);
    }
    const geometryEpsilon = 1e-9;
    function closestAxisPoints(aMin, aMax, bMin, bMax) {
        if (aMax < bMin) return [aMax, bMin];
        if (bMax < aMin) return [aMin, bMax];
        const shared = (Math.max(aMin, bMin) + Math.min(aMax, bMax)) / 2;
        return [shared, shared];
    }
    function rectangleMeasurement(a, b) {
        const [ax, bx] = closestAxisPoints(a.left, a.right, b.left, b.right);
        const [ay, by] = closestAxisPoints(a.top, a.bottom, b.top, b.bottom);
        const distance = Math.hypot(bx - ax, by - ay);
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapLength = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const relation = overlapWidth > geometryEpsilon && overlapLength > geometryEpsilon
            ? 'overlap' : distance <= geometryEpsilon ? 'touching' : 'separated';
        return { start: { x: ax, y: ay }, end: { x: bx, y: by }, distance, relation };
    }
    function touchesPlot(plot, object) {
        const rect = objectRect(object);
        return rect.right > 0 && rect.bottom > 0 && rect.left < plot.width && rect.top < plot.length;
    }
    function isInsidePlot(plot, object) {
        const rect = objectRect(object);
        const epsilon = geometryEpsilon; // Avoid marking an exact boundary contact due to conversion round-off.
        return rect.left >= -epsilon && rect.top >= -epsilon
            && rect.right <= plot.width + epsilon && rect.bottom <= plot.length + epsilon;
    }
    function createView(plot, width, height) {
        const scale = Math.max(0.01, Math.min(Math.max(1, width - 80) / plot.width,
            Math.max(1, height - 80) / plot.length) * 0.9);
        return { scale, left: (width - plot.width * scale) / 2, top: 40 };
    }
    function toScreen(point, view) {
        return { x: view.left + point.x * view.scale, y: view.top + point.y * view.scale };
    }
    function toMetres(point, view) {
        return { x: (point.x - view.left) / view.scale, y: (point.y - view.top) / view.scale };
    }
    const api = { objectSize, objectRect, borderDistances, rectangleDistance, rectangleMeasurement, geometryEpsilon, touchesPlot, isInsidePlot, createView, toScreen, toMetres };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
