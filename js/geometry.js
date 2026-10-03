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
    function rectangleSegmentMeasurement(rect,line) {
        const a={x:line.x1,y:line.y1},b={x:line.x2,y:line.y2};
        const clamp=(v,lo,hi)=>Math.max(lo,Math.min(v,hi));
        const corners=[{x:rect.left,y:rect.top},{x:rect.right,y:rect.top},{x:rect.right,y:rect.bottom},{x:rect.left,y:rect.bottom}];
        const candidates=[a,b].map(p=>({start:{x:clamp(p.x,rect.left,rect.right),y:clamp(p.y,rect.top,rect.bottom)},end:p}));
        const dx=b.x-a.x,dy=b.y-a.y;
        for(const p of corners) {
            const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1);
            candidates.push({start:p,end:{x:a.x+t*dx,y:a.y+t*dy}});
        }
        // Liang–Barsky segment clipping: an intersection has distance zero.
        let lo=0,hi=1,hit=true;
        for(const [p,q] of [[-dx,a.x-rect.left],[dx,rect.right-a.x],[-dy,a.y-rect.top],[dy,rect.bottom-a.y]]) {
            if(p===0){if(q<0)hit=false;}else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
        }
        if(hit&&lo<=hi){const p={x:a.x+lo*dx,y:a.y+lo*dy};return {start:p,end:p,distance:0};}
        return candidates.map(m=>({...m,distance:Math.hypot(m.start.x-m.end.x,m.start.y-m.end.y)})).sort((x,y)=>x.distance-y.distance)[0];
    }
    const api = { objectSize, objectRect, borderDistances, rectangleDistance, rectangleMeasurement, rectangleSegmentMeasurement,geometryEpsilon, touchesPlot, isInsidePlot, createView, toScreen, toMetres };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
