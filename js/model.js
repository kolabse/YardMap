(() => {
    const { definitions, borderLabels } = typeof module !== 'undefined' && module.exports
        ? require('./catalog.js') : globalThis.YardMap;

    function validateSize(width, length) {
        if (![width, length].every(value => Number.isFinite(value) && value > 0)) {
            throw new RangeError('Размеры должны быть положительными числами');
        }
    }

    function createProject() {
        return { version: 1, name: 'Мой участок', settings: { units: 'm' }, plot: null, objects: [], nextObjectId: 1 };
    }

    function setPlot(project, width, length) {
        validateSize(width, length);
        project.plot = {
            width, length,
            borders: project.plot?.borders || { north: '', east: '', south: '', west: '' }
        };
    }

    function setBorder(project, side, type) {
        if (!project.plot || !Object.hasOwn(project.plot.borders, side)) return;
        if (type !== '' && !Object.hasOwn(borderLabels, type)) throw new RangeError('Неизвестный тип границы');
        project.plot.borders[side] = type;
    }

    function addObject(project, type, width, length) {
        if (!project.plot) throw new Error('Сначала создайте участок');
        if (!Object.hasOwn(definitions, type)) throw new RangeError('Выберите тип постройки');
        validateSize(width, length);
        const object = {
            id: `object-${project.nextObjectId++}`, type, name: definitions[type].name,
            width, length, rotation: 0, x: null, y: null, status: 'waiting'
        };
        project.objects.push(object);
        return object;
    }

    function placeObject(project, id, x, y) {
        if (![x, y].every(Number.isFinite)) throw new RangeError('Координаты должны быть конечными числами');
        const object = project.objects.find(item => item.id === id);
        if (!object) throw new RangeError('Объект не найден');
        Object.assign(object, { x, y, status: 'placed' });
        return object;
    }

    function returnToWaiting(project, id) {
        const object = project.objects.find(item => item.id === id);
        if (object) Object.assign(object, { x: null, y: null, status: 'waiting' });
    }

    const api = { createProject, setPlot, setBorder, addObject, placeObject, returnToWaiting };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
