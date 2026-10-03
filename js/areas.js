(() => {
    const catalog=typeof module!=='undefined'&&module.exports?require('./catalog.js'):globalThis.YardMap;
    function unionArea(objects,plot) {
        const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
        const shapes=objects.filter(o=>o.geometry?.kind!=='line').map(o=>({object:o,rect:g.objectRect(o)}));
        const xs=[0,plot.width];
        for(const {object:o,rect:r} of shapes) {xs.push(Math.max(0,Math.min(plot.width,r.left)),Math.max(0,Math.min(plot.width,r.right)));if(o.geometry?.kind==='circle'&&o.x>0&&o.x<plot.width)xs.push(o.x);}
        // Rectangle edges partition constant coverage; circle extrema partition curved coverage.
        const points=[...new Set(xs)].sort((a,b)=>a-b);
        function integrate(f,a,b,tolerance,depth=18) {
            const simpson=(a,b,fa,fm,fb)=>(b-a)*(fa+4*fm+fb)/6;
            const recurse=(a,b,fa,fm,fb,whole,tol,depth)=>{
                const mid=(a+b)/2,l=(a+mid)/2,r=(mid+b)/2,fl=f(l),fr=f(r);
                const left=simpson(a,mid,fa,fl,fm),right=simpson(mid,b,fm,fr,fb),delta=left+right-whole;
                if(!depth||Math.abs(delta)<=15*tol)return left+right+delta/15;
                return recurse(a,mid,fa,fl,fm,left,tol/2,depth-1)+recurse(mid,b,fm,fr,fb,right,tol/2,depth-1);
            };
            const fa=f(a),fm=f((a+b)/2),fb=f(b);return recurse(a,b,fa,fm,fb,simpson(a,b,fa,fm,fb),tolerance,depth);
        }
        let total=0;
        for(let i=1;i<points.length;i++) {
            const left=points[i-1],right=points[i],mid=(left+right)/2;
            const active=shapes.filter(s=>s.rect.left<mid&&s.rect.right>mid);
            const span=x=>{
                const intervals=[];
                for(const {object:o,rect:r} of active) {
                    let lo=r.top,hi=r.bottom;
                    if(o.geometry?.kind==='circle') {const radius=o.geometry.radius,d=Math.sqrt(Math.max(0,radius*radius-(x-o.x)*(x-o.x)));lo=o.y-d;hi=o.y+d;}
                    lo=Math.max(0,lo);hi=Math.min(plot.length,hi);if(hi>lo)intervals.push([lo,hi]);
                }
                // Merge vertical intervals before integration so overlaps contribute only once.
                intervals.sort((a,b)=>a[0]-b[0]);let length=0,end=-Infinity;
                for(const [lo,hi] of intervals){if(hi>end){length+=hi-Math.max(lo,end);end=hi;}}return length;
            };
            total+=active.some(s=>s.object.geometry?.kind==='circle')?integrate(span,left,right,1e-7/points.length):span(mid)*(right-left);
        }
        return Math.max(0,Math.min(plot.width*plot.length,total));
    }
    function calculateAreaSummary(project) {
        if(!project.plot)return {plot:0,sotkas:0,covered:0,percent:0,categories:{},objects:[]};
        const objects=project.objects.filter(o=>o.status==='placed'&&o.assessment?.ownership!=='neighbor');
        const categories={};for(const category of Object.keys(catalog.categoryLabels))categories[category]=unionArea(objects.filter(o=>catalog.definitions[o.type].category===category),project.plot);
        const covered=unionArea(objects,project.plot),area=project.plot.width*project.plot.length;
        return {plot:area,sotkas:area/100,covered,percent:covered/area*100,categories,
            objects:objects.map(o=>({id:o.id,area:unionArea([o],project.plot)}))};
    }
    const api={calculateAreaSummary,unionArea};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
