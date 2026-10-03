(() => {
    const { definitions, borderLabels } = typeof module !== 'undefined' && module.exports
        ? require('./catalog.js') : globalThis.YardMap;
    const assessment = typeof module !== 'undefined' && module.exports ? require('./assessment.js') : globalThis.YardMap;

    const plots=typeof module!=='undefined'&&module.exports?require('./plot-geometry.js'):globalThis.YardMap;
    const shapes=typeof module!=='undefined'&&module.exports?require('./shapes.js'):globalThis.YardMap;
    function validateSize(width, length) {
        if (![width, length].every(value => Number.isFinite(value) && value > 0)) {
            throw new RangeError('Размеры должны быть положительными числами');
        }
    }

    function createProject() {
        return { version: 1, name: 'Мой участок', settings: { units: 'm' }, assessment:assessment.projectAssessment(), plot: null, objects: [], nextObjectId: 1 };
    }

    function setPlot(project, width, length) {
        validateSize(width, length);
        project.plot = {
            ...(project.version===2?{kind:'rectangle'}:{}),width, length,
            borders: project.plot?.borders || { north: '', east: '', south: '', west: '' }
        };
    }

    function setPolygon(project,vertices,nextVertexId) {
        const counter=nextVertexId??Math.max(project.plot?.nextVertexId??1,1+Math.max(0,...vertices.map(v=>Number(/^vertex-([1-9]\d*)$/.exec(v.id)?.[1]??0))));
        const plot=plots.normalizePolygon(vertices,counter);project.plot=plot;project.version=2;return plot;
    }
    function setBorder(project, side, type) {
        if(project.plot?.kind==='polygon')throw new Error('Задайте соседство в редакторе сторон контура.');
        if (!project.plot || !Object.hasOwn(project.plot.borders, side)) return;
        if (type !== '' && !Object.hasOwn(borderLabels, type)) throw new RangeError('Неизвестный тип границы');
        project.plot.borders[side] = type;
    }

    function addObject(project, type, width, length, geometry) {
        if (!project.plot) throw new Error('Сначала создайте участок');
        if (!Object.hasOwn(definitions, type)) throw new RangeError('Выберите тип постройки');
        validateSize(width, length);
        const shape=shapes.canonicalShape(type,width,length,geometry);
        const object = {
            id: `object-${project.nextObjectId++}`, type, name: definitions[type].name,
            ...shape, rotation: 0, x: null, y: null, status: 'waiting', locked: false, assessment:assessment.objectAssessment()
        };
        project.objects.push(object);
        return object;
    }

    function placeObject(project, id, x, y) {
        if (![x, y].every(Number.isFinite)) throw new RangeError('Координаты должны быть конечными числами');
        const object = project.objects.find(item => item.id === id);
        if (!object) throw new RangeError('Объект не найден');
        if (object.locked) throw new RangeError('Положение объекта закреплено');
        Object.assign(object, { x, y, status: 'placed' });
        return object;
    }

    function returnToWaiting(project, id) {
        const object = project.objects.find(item => item.id === id);
        if (object?.locked) throw new RangeError('Положение объекта закреплено');
        if (object) Object.assign(object, { x: null, y: null, status: 'waiting' });
    }

    function updateObject(project, id, changes) {
        const object = project.objects.find(item => item.id === id);
        if (!object) throw new RangeError('Объект не найден');
        const next = { ...object, ...changes };
        validateSize(next.width,next.length);
        const geometry=changes.geometry!==undefined?changes.geometry:
            object.geometry?.kind==='circle'&&changes.width!==undefined?{kind:'circle',radius:changes.width/2}:object.geometry;
        Object.assign(next,shapes.canonicalShape(object.type,next.width,next.length,geometry));
        validateSize(next.width,next.length);
        if (typeof next.name !== 'string' || !next.name.trim() || next.name.length > 200) throw new RangeError('Название: от 1 до 200 символов');
        if (![0,90,180,270].includes(next.rotation)) throw new RangeError('Неверный поворот');
        if (!['waiting','placed'].includes(next.status)) throw new RangeError('Неверное состояние размещения');
        if (next.status === 'placed' && ![next.x,next.y].every(Number.isFinite)) throw new RangeError('Координаты должны быть конечными числами');
        if (typeof next.locked !== 'boolean') throw new RangeError('Неверное состояние блокировки');
        if (object.locked && ['x','y','rotation','status'].some(key => next[key] !== object[key])) throw new RangeError('Положение объекта закреплено');
        next.assessment=assessment.objectAssessment(next.assessment);
        if(next.rotation!==object.rotation)next.assessment.projections={left:null,right:null,top:null,bottom:null};
        assessment.validateConnections(project.objects.map(o=>o.id===id?next:o));
        Object.assign(object,{ name:next.name,width:next.width,length:next.length,rotation:next.rotation,
            status:next.status,x:next.status==='waiting'?null:next.x,y:next.status==='waiting'?null:next.y,locked:next.locked,assessment:next.assessment });
        if(next.geometry)object.geometry=next.geometry;
        return object;
    }
    function copyObject(project,id) {
        const source = project.objects.find(item=>item.id===id);
        if (!source) throw new RangeError('Объект не найден');
        const copy = addObject(project,source.type,source.width,source.length,source.geometry);
        copy.name = source.name.slice(0,190)+' (копия)'; copy.rotation=source.rotation;
        copy.assessment=assessment.objectAssessment(source.assessment);copy.assessment.attachedTo=null;
        return copy;
    }
    function deleteObject(project,id) {
        project.objects=project.objects.filter(item=>item.id!==id);
        for(const o of project.objects)if(o.assessment?.attachedTo===id)o.assessment.attachedTo=null;
    }
    const api = { createProject, setPlot, setPolygon,setBorder, addObject, placeObject, returnToWaiting, updateObject, copyObject, deleteObject };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
