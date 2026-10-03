(() => {
    const {definitions}=typeof module!=='undefined'&&module.exports?require('./catalog.js'):globalThis.YardMap;
    function normalizeGeometry(type,width,length,value) {
        const shape=definitions[type]?.shape;
        if(shape==='rectangle') {
            if(value!==undefined)throw new Error('Прямоугольный объект не поддерживает другую геометрию.');
            return undefined;
        }
        if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||value.kind!==shape))throw new Error('Неверный тип геометрии объекта.');
        if(shape==='circle') {
            const radius=value===undefined?width/2:value.radius;
            if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(2*radius))throw new Error('Радиус кроны должен быть положительным конечным числом.');
            return {kind:'circle',radius};
        }
        const dx=value===undefined?width:value.dx,dy=value===undefined?0:value.dy;
        if(![dx,dy].every(Number.isFinite)||(dx===0&&dy===0)||!Number.isFinite(Math.hypot(dx,dy)))throw new Error('Отрезок: конечные смещения и ненулевая длина.');
        return {kind:'line',dx,dy};
    }
    function canonicalShape(type,width,length,value) {
        const geometry=normalizeGeometry(type,width,length,value);
        if(geometry?.kind==='circle')return {width:2*geometry.radius,length:2*geometry.radius,geometry};
        if(geometry?.kind==='line')return {width:Math.max(.1,Math.abs(geometry.dx)),length:Math.max(.1,Math.abs(geometry.dy)),geometry};
        return {width,length};
    }
    // x/y is the line start; dx/dy is the unrotated vector, not a bounding-box size.
    function linePoints(object) {
        const {dx,dy}=object.geometry,turn=((object.rotation%360)+360)%360;
        const delta=turn===90?{x:-dy,y:dx}:turn===180?{x:-dx,y:-dy}:turn===270?{x:dy,y:-dx}:{x:dx,y:dy};
        return [{x:object.x,y:object.y},{x:object.x+delta.x,y:object.y+delta.y}];
    }
    const api={normalizeGeometry,canonicalShape,linePoints};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
