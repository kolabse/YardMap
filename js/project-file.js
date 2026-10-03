(() => {
    const { definitions, borderLabels } = typeof module !== 'undefined' && module.exports
        ? require('./catalog.js') : globalThis.YardMap;
    const plots=typeof module!=='undefined'&&module.exports?require('./plot-geometry.js'):globalThis.YardMap;
    const shapes=typeof module!=='undefined'&&module.exports?require('./shapes.js'):globalThis.YardMap;
    const maxProjectFileBytes = 2 * 1024 * 1024;
    const assessment = typeof module !== 'undefined' && module.exports ? require('./assessment.js') : globalThis.YardMap;
    function fail(message) { throw new Error(message); }
    function record(value, label) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: ожидается объект.`);
    }
    function name(value, label) {
        if (typeof value !== 'string' || !value.trim() || value.length > 200) fail(`${label}: укажите название длиной до 200 символов.`);
        return value;
    }
    function positive(value, label) {
        if (!Number.isFinite(value) || value <= 0) fail(`${label}: требуется положительное конечное число.`);
        return value;
    }
    // Construct a new canonical model from a whitelist; never mutate imported data.
    function validateProject(data) {
        record(data,'Проект');
        if (![1,2].includes(data.version)) fail('Неподдерживаемая версия проекта. Поддерживаются версии 1 и 2.');
        const projectName = name(data.name,'Название проекта');
        record(data.settings,'Настройки');
        if (data.settings.units !== 'm') fail('Единицы проекта должны быть метрами (m).');
        if (!Array.isArray(data.objects) || data.objects.length > 1000) fail('Объекты: требуется массив, не более 1000 объектов.');
        let plot = null;
        if (data.plot !== null) {
            record(data.plot,'Участок');
            if(data.version===2&&data.plot.kind==='polygon') {
                if(!Number.isSafeInteger(data.plot.nextVertexId))fail('Неверный счётчик вершин.');
                plot=plots.normalizePolygon(data.plot.vertices,data.plot.nextVertexId);
                if(plot.width!==data.plot.width||plot.length!==data.plot.length)fail('Габариты не соответствуют контуру.');
            }else {
            if(data.version===2&&data.plot.kind!=='rectangle'||data.version===1&&data.plot.kind==='polygon')fail('Неверный вид участка для версии проекта.');
            record(data.plot.borders,'Соседство сторон');
            const borders = {};
            for (const side of ['north','east','south','west']) {
                const type = data.plot.borders[side];
                if (typeof type !== 'string' || (type !== '' && !Object.hasOwn(borderLabels,type))) fail(`Неизвестное соседство стороны ${side}.`);
                borders[side] = type;
            }
            plot = { ...(data.version===2?{kind:'rectangle'}:{}),width: positive(data.plot.width,'Ширина участка'), length: positive(data.plot.length,'Длина участка'), borders };
            }
        } else if (data.objects.length) fail('Проект с объектами должен содержать участок.');
        const ids = new Set(); let largestId = 0;
        const objects = data.objects.map((object,index) => {
            const label = `Объект ${index + 1}`; record(object,label);
            if (typeof object.id !== 'string' || !object.id.trim() || object.id.length > 200 || ids.has(object.id)) fail(`${label}: ID отсутствует или повторяется.`);
            ids.add(object.id);
            const generated = /^object-([1-9]\d*)$/.exec(object.id);
            if (generated) {
                const number = Number(generated[1]);
                if (!Number.isSafeInteger(number)) fail(`${label}: ID превышает поддерживаемый диапазон.`);
                largestId = Math.max(largestId,number);
            }
            if (typeof object.type !== 'string' || !Object.hasOwn(definitions,object.type)) fail(`${label}: неизвестный тип объекта.`);
            if (![0,90,180,270].includes(object.rotation)) fail(`${label}: поворот должен быть 0, 90, 180 или 270 градусов.`);
            if (!['waiting','placed'].includes(object.status)) fail(`${label}: неизвестное состояние размещения.`);
            if (object.locked !== undefined && typeof object.locked !== 'boolean') fail(`${label}: неверное состояние блокировки.`);
            if (object.status === 'waiting' ? object.x !== null || object.y !== null
                : !Number.isFinite(object.x) || !Number.isFinite(object.y)) fail(`${label}: неверные координаты.`);
            if(definitions[object.type].shape!=='rectangle'&&object.geometry===undefined)fail(`${label}: отсутствует геометрия.`);
            const shape=shapes.canonicalShape(object.type,positive(object.width,label),positive(object.length,label),object.geometry);
            if(shape.width!==object.width||shape.length!==object.length)fail(`${label}: размеры не соответствуют геометрии.`);
            return { id: object.id, type: object.type, name: name(object.name,label),
                ...shape,
                rotation: object.rotation, x: object.x, y: object.y, status: object.status, locked: object.locked ?? false,
                assessment:assessment.objectAssessment(object.assessment) };
        });
        if (!Number.isSafeInteger(data.nextObjectId) || data.nextObjectId <= largestId || data.nextObjectId < 1
            || data.nextObjectId >= Number.MAX_SAFE_INTEGER) fail('Неверный счётчик ID объектов.');
        assessment.validateConnections(objects);
        return { version: data.version, name: projectName, settings: { units: 'm' }, assessment:assessment.projectAssessment(data.assessment),plot, objects, nextObjectId: data.nextObjectId };
    }
    function parseProject(text) {
        if (typeof text !== 'string') fail('Ожидается текст файла JSON.');
        if (text.length > maxProjectFileBytes) fail('Файл проекта слишком большой (максимум 2 МиБ).');
        let data;
        try { data = JSON.parse(text.replace(/^\uFEFF/,'')); }
        catch { fail('Не удалось прочитать JSON. Проверьте содержимое файла.'); }
        return validateProject(data);
    }
    function serializeProject(project) { return JSON.stringify(validateProject(project),null,2); }
    const api = { parseProject, serializeProject, maxProjectFileBytes };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {},api);
})();
