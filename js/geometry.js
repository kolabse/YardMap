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
    function touchesPlot(plot, object) {
        const rect = objectRect(object);
        return rect.right > 0 && rect.bottom > 0 && rect.left < plot.width && rect.top < plot.length;
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
    const api = { objectSize, objectRect, borderDistances, rectangleDistance, touchesPlot, createView, toScreen, toMetres };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
