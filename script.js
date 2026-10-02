// UI/controller state is deliberately separate from serializable project data.
let project = YardMap.createProject();
const plotContainer = document.querySelector('.plot-container');
const waitingArea = document.getElementById('waiting-area');
let view = null;
let selectedId = null;
let highlightedType = null;
let activeDrag = null;
const renderer = new YardMap.Renderer(plotContainer, waitingArea, startDrag, highlightBuildings);

document.getElementById('create-plot').addEventListener('click', createPlot);
document.getElementById('create-building').addEventListener('click', createBuilding);
document.getElementById('building-type').addEventListener('change', () => {
    document.getElementById('building-size-controls').style.display = 'block';
    setFieldError('building-type', '');
});
document.getElementById('new-project').addEventListener('click', () => {
    document.getElementById('new-project-confirmation').hidden = false;
});
document.getElementById('cancel-new-project').addEventListener('click', () => {
    document.getElementById('new-project-confirmation').hidden = true;
});
document.getElementById('confirm-new-project').addEventListener('click', confirmNewProject);
const sizeFields = ['plot-width', 'plot-length', 'building-width', 'building-length'];
for (const id of sizeFields) {
    document.getElementById(id).addEventListener('input', () => setFieldError(id, ''));
}
for (const side of ['north', 'east', 'south', 'west']) {
    document.getElementById(`${side}-side`).addEventListener('change', event => {
        YardMap.setBorder(project, side, event.target.value);
        render();
    });
}
window.addEventListener('resize', render);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(plotContainer);
window.addEventListener('blur', cancelDrag);
render();

function render() {
    view = renderer.render(project, selectedId, highlightedType);
    if (project.plot) {
        document.getElementById('create-plot').textContent = 'Изменить размеры';
        document.getElementById('plot-summary').textContent = `Текущий участок: ${project.plot.width} × ${project.plot.length} м`;
        document.getElementById('new-project').hidden = false;
    }
}

function setFieldError(id, message) {
    document.getElementById(id).setAttribute('aria-invalid', message ? 'true' : 'false');
    document.getElementById(`${id}-error`).textContent = message;
}

function readDimensions(prefix) {
    const dimensions = [];
    let valid = true;
    for (const side of ['width', 'length']) {
        const id = `${prefix}-${side}`;
        const value = Number(document.getElementById(id).value);
        const error = !Number.isFinite(value) || value <= 0;
        setFieldError(id, error ? 'Укажите конечное число больше нуля в метрах.' : '');
        if (error) valid = false;
        dimensions.push(value);
    }
    return valid ? dimensions : null;
}

function createPlot() {
    const dimensions = readDimensions('plot');
    if (!dimensions) return;
    cancelDrag();
    YardMap.setPlot(project, ...dimensions);
    // Borders can be selected before a plot exists; preserve these selections.
    for (const side of ['north', 'east', 'south', 'west']) {
        YardMap.setBorder(project, side, document.getElementById(`${side}-side`).value);
    }
    document.getElementById('building-section').style.display = 'block';
    document.getElementById('rules-info').style.display = 'block';
    document.getElementById('waiting-section').style.display = 'block';
    render();
}

function createBuilding() {
    const type = document.getElementById('building-type').value;
    const validType = Object.hasOwn(YardMap.definitions, type);
    setFieldError('building-type', validType ? '' : 'Выберите тип постройки.');
    const dimensions = readDimensions('building');
    if (!dimensions || !validType || !project.plot) return;
    const object = YardMap.addObject(project, type, ...dimensions);
    selectedId = object.id;
    render();
}

function confirmNewProject() {
    const dimensions = readDimensions('plot');
    if (!dimensions) return;
    cancelDrag();
    project = YardMap.createProject();
    YardMap.setPlot(project, ...dimensions);
    selectedId = null;
    highlightedType = null;
    for (const side of ['north', 'east', 'south', 'west']) {
        document.getElementById(`${side}-side`).value = '';
    }
    document.getElementById('building-type').value = '';
    document.getElementById('building-width').value = '5';
    document.getElementById('building-length').value = '6';
    document.getElementById('building-size-controls').style.display = 'none';
    for (const id of [...sizeFields, 'building-type']) setFieldError(id, '');
    document.getElementById('new-project-confirmation').hidden = true;
    render();
}

function startDrag(event) {
    if (event.button !== 0 || !view) return;
    const id = event.currentTarget.dataset.id;
    const object = project.objects.find(item => item.id === id);
    if (!object) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = YardMap.objectSize(object);
    activeDrag = {
        id, before: { ...object },
        offsetX: (event.clientX - rect.left) / rect.width * size.width,
        offsetY: (event.clientY - rect.top) / rect.height * size.length
    };
    selectedId = id;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    event.preventDefault();
}

function drag(event) {
    if (!activeDrag || !view) return;
    const containerRect = plotContainer.getBoundingClientRect();
    const point = YardMap.toMetres({
        x: event.clientX - containerRect.left - (plotContainer.clientLeft || 0),
        y: event.clientY - containerRect.top - (plotContainer.clientTop || 0)
    }, view);
    YardMap.placeObject(project, activeDrag.id, point.x - activeDrag.offsetX, point.y - activeDrag.offsetY);
    render();
}

function stopDrag() {
    if (!activeDrag) return;
    const object = project.objects.find(item => item.id === activeDrag.id);
    if (object.status === 'placed' && !YardMap.touchesPlot(project.plot, object)) {
        YardMap.returnToWaiting(project, object.id);
    }
    activeDrag = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    render();
}

function cancelDrag() {
    if (!activeDrag) return;
    Object.assign(project.objects.find(item => item.id === activeDrag.id), activeDrag.before);
    activeDrag = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    render();
}

function highlightBuildings(type) {
    highlightedType = type;
    render();
}
