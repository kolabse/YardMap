(() => {
    const catalog=typeof module!=='undefined'&&module.exports?require('./catalog.js'):globalThis.YardMap;
    const epsilon=1e-9;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    function onSegment(p,a,b) {
        return Math.abs(cross(a,b,p))<=epsilon*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))&&p.x>=Math.min(a.x,b.x)-epsilon&&p.x<=Math.max(a.x,b.x)+epsilon&&p.y>=Math.min(a.y,b.y)-epsilon&&p.y<=Math.max(a.y,b.y)+epsilon;
    }
    function intersects(a,b,c,d) {
        const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
        return (x*y<0&&u*v<0)||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
    }
    function plotArea(plot) {
        if(plot.kind!=='polygon')return plot.width*plot.length;
        const v=plot.vertices;
        return Math.abs(v.reduce((sum,p,i)=>{const q=v[(i+1)%v.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
    }
    function normalizePolygon(input,nextVertexId) {
        if(!Array.isArray(input)||input.length<3||input.length>100)throw new Error('Контур: от 3 до 100 вершин.');
        const ids=new Set();let largest=0;
        const vertices=input.map(p=>{
            if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!p.id.trim()||p.id.length>200||ids.has(p.id))throw new Error('Вершины: уникальные непустые ID.');
            ids.add(p.id);const match=/^vertex-([1-9]\d*)$/.exec(p.id);if(match)largest=Math.max(largest,Number(match[1]));
            if(![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Вершины: конечные неотрицательные координаты в метрах.');
            const border=p.border??'',lanes=p.lanes??'unknown',minimum=p.minimum??null;
            if(border!==''&&!Object.hasOwn(catalog.borderLabels,border))throw new Error('Неверное соседство стороны.');
            if(!['unknown','one','two'].includes(lanes))throw new Error('Неверная полосность стороны.');
            if(minimum!==null&&(!Number.isFinite(minimum)||minimum<0))throw new Error('Мой отступ: неотрицательное конечное число или пустое поле.');
            return {id:p.id,x:p.x,y:p.y,border,lanes,minimum};
        });
        const n=vertices.length;
        for(let i=0;i<n;i++) {
            const a=vertices[i],b=vertices[(i+1)%n],c=vertices[(i+2)%n];
            if(Math.hypot(b.x-a.x,b.y-a.y)<=epsilon)throw new Error('Сторона не может иметь нулевую длину.');
            if(Math.abs(cross(a,b,c))<=epsilon&&((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y))>0)throw new Error('Смежные стороны перекрываются.');
            for(let j=i+1;j<n;j++)if(j!==i+1&&!(i===0&&j===n-1)&&intersects(a,b,vertices[j],vertices[(j+1)%n]))throw new Error('Контур самопересекается или несмежные стороны касаются.');
        }
        const width=Math.max(...vertices.map(p=>p.x)),length=Math.max(...vertices.map(p=>p.y));
        const plot={kind:'polygon',vertices,width,length,nextVertexId:nextVertexId??largest+1,borders:{north:'',east:'',south:'',west:''}};
        if(!Number.isFinite(plotArea(plot))||plotArea(plot)<=epsilon||!Number.isFinite(width*length))throw new Error('Контур должен иметь ненулевую конечную площадь.');
        if(!Number.isSafeInteger(plot.nextVertexId)||plot.nextVertexId<=largest||plot.nextVertexId<1||plot.nextVertexId>=Number.MAX_SAFE_INTEGER)throw new Error('Неверный счётчик вершин.');
        return plot;
    }
    function plotEdges(plot) {
        if(plot.kind==='polygon')return plot.vertices.map((a,i)=>{
            const b=plot.vertices[(i+1)%plot.vertices.length];return {id:a.id,edgeId:a.id,label:`Сторона ${i+1}`,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},length:Math.hypot(b.x-a.x,b.y-a.y),border:a.border,lanes:a.lanes,minimum:a.minimum};
        });
        const {width:w,length:h,borders}=plot;
        return [{id:'north',side:'top',a:{x:0,y:0},b:{x:w,y:0}}, {id:'east',side:'right',a:{x:w,y:0},b:{x:w,y:h}}, {id:'south',side:'bottom',a:{x:w,y:h},b:{x:0,y:h}}, {id:'west',side:'left',a:{x:0,y:h},b:{x:0,y:0}}].map(e=>({...e,label:e.id,length:Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y),border:borders[e.id],minimum:null}));
    }
    function pointInside(plot,p) {
        if(plot.kind!=='polygon')return p.x>=-epsilon&&p.y>=-epsilon&&p.x<=plot.width+epsilon&&p.y<=plot.length+epsilon;
        const v=plot.vertices;let inside=false;
        for(let i=0,j=v.length-1;i<v.length;j=i++) {
            const a=v[j],b=v[i];if(onSegment(p,a,b))return true;
            if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
        }
        return inside;
    }
    function segmentInside(plot,a,b) {
        if(!pointInside(plot,a)||!pointInside(plot,b))return false;
        const dx=b.x-a.x,dy=b.y-a.y,ts=[0,1],length2=dx*dx+dy*dy;
        if(length2===0)return true;
        for(const e of plotEdges(plot)) {
            const ex=e.b.x-e.a.x,ey=e.b.y-e.a.y,den=dx*ey-dy*ex;
            if(den) {const t=((e.a.x-a.x)*ey-(e.a.y-a.y)*ex)/den,u=((e.a.x-a.x)*dy-(e.a.y-a.y)*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)ts.push(t);}
            else if(Math.abs(cross(a,b,e.a))<=epsilon)for(const p of [e.a,e.b]){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/length2;if(t>0&&t<1)ts.push(t);}
        }
        ts.sort((a,b)=>a-b);
        for(let i=1;i<ts.length;i++) {const t=(ts[i-1]+ts[i])/2;if(!pointInside(plot,{x:a.x+t*dx,y:a.y+t*dy}))return false;}
        return true;
    }
    function objectInsidePolygon(plot,o) {
        const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
        if(o.type==='tree')return pointInside(plot,o);
        if(o.geometry?.kind==='line'){const [a,b]=(typeof module!=='undefined'&&module.exports?require('./shapes.js'):globalThis.YardMap).linePoints(o);return segmentInside(plot,a,b);}
        if(o.geometry?.kind==='circle')return pointInside(plot,o)&&boundaryMeasurements(plot,o,null,true).every(m=>m.actual>=o.geometry.radius-epsilon);
        const r=g.objectRect(o),v=[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}];
        return v.every((p,i)=>segmentInside(plot,p,v[(i+1)%4]));
    }
    function objectTouchesPolygon(plot,o) {
        const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
        if(pointInside(plot,o))return true;
        if(plotEdges(plot).some(e=>g.objectMeasurement(o,{geometry:{kind:'line',dx:e.b.x-e.a.x,dy:e.b.y-e.a.y},x:e.a.x,y:e.a.y,rotation:0}).distance<=epsilon))return true;
        if(o.geometry?.kind==='circle')return plot.vertices.some(p=>Math.hypot(p.x-o.x,p.y-o.y)<=o.geometry.radius+epsilon);
        const r=g.objectRect(o);return o.geometry?.kind!=='line'&&plot.vertices.some(p=>p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom);
    }
    function boundaryMeasurements(plot,o,rect=null,trunk=false) {
        const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
        const proxy=trunk?{x:o.x,y:o.y,width:0,length:0,rotation:0}:rect?{x:rect.left,y:rect.top,width:rect.right-rect.left,length:rect.bottom-rect.top,rotation:0}:o;
        return plotEdges(plot).map(e=>{
            const line={geometry:{kind:'line',dx:e.b.x-e.a.x,dy:e.b.y-e.a.y},x:e.a.x,y:e.a.y,rotation:0};
            const m=g.objectMeasurement(proxy,line);return {...e,...m,actual:m.distance};
        });
    }
    // Vertical intervals of a simple polygon; concave contours can produce several spans.
    function plotIntervals(plot,x) {
        if(plot.kind!=='polygon')return [[0,plot.length]];
        const ys=[];for(const {a,b} of plotEdges(plot))if((a.x<=x&&x<b.x)||(b.x<=x&&x<a.x))ys.push(a.y+(x-a.x)*(b.y-a.y)/(b.x-a.x));
        ys.sort((a,b)=>a-b);const intervals=[];for(let i=1;i<ys.length;i+=2)intervals.push([ys[i-1],ys[i]]);return intervals;
    }
    const api={normalizePolygon,plotArea,plotEdges,pointInside,segmentInside,objectInsidePolygon,objectTouchesPolygon,boundaryMeasurements,plotIntervals};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
