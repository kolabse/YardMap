// UI/controller state is deliberately separate from serializable project data.
const project = YardMap.createProject();
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
});
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
}

function createPlot() {
    try {
        YardMap.setPlot(project, Number(document.getElementById('plot-width').value),
            Number(document.getElementById('plot-length').value));
    } catch (error) { alert(error.message); return; }
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
    try {
        const object = YardMap.addObject(project, document.getElementById('building-type').value,
            Number(document.getElementById('building-width').value) / 100,
            Number(document.getElementById('building-length').value) / 100);
        selectedId = object.id;
        render();
    } catch (error) { alert(error.message); }
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
