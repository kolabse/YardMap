(() => {
    // Metres are the only units here, except at the explicit view boundary.
    const shapes=typeof module!=='undefined'&&module.exports?require('./shapes.js'):globalThis.YardMap;
    function objectSize(object) {
        if(object.geometry?.kind==='circle')return {width:object.geometry.radius*2,length:object.geometry.radius*2};
        if(object.geometry?.kind==='line') {
            const [a,b]=shapes.linePoints({...object,x:0,y:0});
            return {width:Math.max(.1,Math.abs(b.x-a.x)),length:Math.max(.1,Math.abs(b.y-a.y))};
        }
        const swapped = Math.abs(object.rotation % 180) === 90;
        return swapped ? { width: object.length, length: object.width }
            : { width: object.width, length: object.length };
    }
    function objectRect(object) {
        if(object.geometry?.kind==='circle') {const r=object.geometry.radius;return {left:object.x-r,right:object.x+r,top:object.y-r,bottom:object.y+r};}
        if(object.geometry?.kind==='line') {const [a,b]=shapes.linePoints(object);return {left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};}

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
        if(object.type==='tree')return object.x>=-geometryEpsilon&&object.y>=-geometryEpsilon&&object.x<=plot.width+geometryEpsilon&&object.y<=plot.length+geometryEpsilon;
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
    function areaSummary(project) {
        return (typeof module!=='undefined'&&module.exports?require('./areas.js'):globalThis.YardMap).calculateAreaSummary(project);
    }
    function objectMeasurement(a,b) {
        const ak=a.geometry?.kind,bk=b.geometry?.kind;
        const reverse=m=>({...m,start:m.end,end:m.start});
        if(!ak&&!bk)return rectangleMeasurement(objectRect(a),objectRect(b));
        if(ak==='circle') {
            if(bk==='circle') {
                const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=a.geometry.radius+b.geometry.radius;
                const unit=d?{x:dx/d,y:dy/d}:{x:1,y:0};
                if(d<=r){const t=Math.max(-a.geometry.radius,Math.min(a.geometry.radius,d-b.geometry.radius));const p={x:a.x+unit.x*t,y:a.y+unit.y*t};return {start:p,end:p,distance:0,relation:d<r-geometryEpsilon?'overlap':'touching'};}
                return {start:{x:a.x+unit.x*a.geometry.radius,y:a.y+unit.y*a.geometry.radius},end:{x:b.x-unit.x*b.geometry.radius,y:b.y-unit.y*b.geometry.radius},distance:Math.max(0,d-r),relation:d<r-geometryEpsilon?'overlap':d<=r+geometryEpsilon?'touching':'separated'};
            }
            let p;
            if(bk==='line') {const [u,v]=shapes.linePoints(b),dx=v.x-u.x,dy=v.y-u.y,t=Math.max(0,Math.min(1,((a.x-u.x)*dx+(a.y-u.y)*dy)/(dx*dx+dy*dy)));p={x:u.x+t*dx,y:u.y+t*dy};}
            else {const r=objectRect(b);p={x:Math.max(r.left,Math.min(a.x,r.right)),y:Math.max(r.top,Math.min(a.y,r.bottom))};}
            const d=Math.hypot(p.x-a.x,p.y-a.y),radius=a.geometry.radius;
            if(d<=radius)return {start:p,end:p,distance:0,relation:d<radius-geometryEpsilon?'overlap':'touching'};
            return {start:d?{x:a.x+(p.x-a.x)*radius/d,y:a.y+(p.y-a.y)*radius/d}:p,end:p,distance:Math.max(0,d-radius),relation:d<radius-geometryEpsilon?'overlap':d<=radius+geometryEpsilon?'touching':'separated'};
        }
        if(bk==='circle')return reverse(objectMeasurement(b,a));
        if(ak==='line'&&!bk) {
            const [u,v]=shapes.linePoints(a),m=rectangleSegmentMeasurement(objectRect(b),{x1:u.x,y1:u.y,x2:v.x,y2:v.y});
            return {...reverse(m),relation:m.distance<=geometryEpsilon?'touching':'separated'};
        }
        if(bk==='line'&&!ak)return reverse(objectMeasurement(b,a));
        const [u,v]=shapes.linePoints(a),[w,z]=shapes.linePoints(b);
        const cross=(a,b)=>a.x*b.y-a.y*b.x,uv={x:v.x-u.x,y:v.y-u.y},wz={x:z.x-w.x,y:z.y-w.y},uw={x:w.x-u.x,y:w.y-u.y};
        const denominator=cross(uv,wz);
        if(denominator) {const t=cross(uw,wz)/denominator,s=cross(uw,uv)/denominator;if(t>=0&&t<=1&&s>=0&&s<=1){const p={x:u.x+t*uv.x,y:u.y+t*uv.y};return {start:p,end:p,distance:0,relation:'touching'};}}
        const toSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return {x:a.x+t*dx,y:a.y+t*dy};};
        const candidates=[{start:u,end:toSegment(u,w,z)},{start:v,end:toSegment(v,w,z)},{start:toSegment(w,u,v),end:w},{start:toSegment(z,u,v),end:z}];
        return candidates.map(m=>({...m,distance:Math.hypot(m.end.x-m.start.x,m.end.y-m.start.y)})).sort((a,b)=>a.distance-b.distance).map(m=>({...m,relation:m.distance<=geometryEpsilon?'touching':'separated'}))[0];
    }
    const api = { areaSummary,objectMeasurement, objectSize, objectRect, borderDistances, rectangleDistance, rectangleMeasurement, rectangleSegmentMeasurement,geometryEpsilon, touchesPlot, isInsidePlot, createView, toScreen, toMetres };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
