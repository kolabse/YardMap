// UI/controller state is deliberately separate from serializable project data.
let project = YardMap.createProject();
let layouts = YardMap.createLayoutCollection(project);
let pendingVariantDeletion = null;
let pendingObjectDeletion = null;
let objectPanelId = null;
let objectPanelDirty = false;
const plotContainer = document.querySelector('.plot-container');
const waitingArea = document.getElementById('waiting-area');
let view = null;
let selectedId = null;
let highlightedType = null;
let activeDrag = null;
let pendingImport = null;
let importRequest = 0;
const projectStore = YardMap.createProjectStore(() => window.localStorage);
let storageBlocked = false;
let committedSaveStatus = { state: 'empty', text: 'Сохранённого проекта пока нет.' };
const renderer = new YardMap.Renderer(plotContainer, waitingArea, startDrag, highlightBuildings, selectObject);

document.getElementById('create-plot').addEventListener('click', createPlot);
document.getElementById('create-building').addEventListener('click', createBuilding);
document.getElementById('object-select').addEventListener('change',event=>selectObject(event.target.value));
document.getElementById('apply-object-properties').addEventListener('click',applyObjectProperties);
document.getElementById('rotate-object').addEventListener('click',rotateSelectedObject);
document.getElementById('copy-object').addEventListener('click',copySelectedObject);
document.getElementById('lock-object').addEventListener('click',toggleObjectLock);
document.getElementById('delete-object').addEventListener('click',requestObjectDeletion);
document.getElementById('confirm-delete-object').addEventListener('click',confirmObjectDeletion);
document.getElementById('cancel-delete-object').addEventListener('click',cancelObjectDeletion);
for (const id of ['object-name','object-width','object-length','object-x','object-y','object-rotation','object-status']) {
    for (const event of ['input','change']) document.getElementById(id).addEventListener(event,()=>{
        objectPanelDirty=true;
        if(id==='object-status' && document.getElementById(id).value==='placed' && selectedObject()?.status==='waiting') {
            for(const field of ['x','y']) if(!document.getElementById(`object-${field}`).value) document.getElementById(`object-${field}`).value='0';
        }
        updatePositionInputs();
    });
}
document.addEventListener('keydown',handleObjectKeyDown);
document.getElementById('variant-select').addEventListener('change', event => switchVariant(event.target.value));
document.getElementById('create-variant').addEventListener('click', createVariant);
document.getElementById('copy-variant').addEventListener('click', copyVariant);
document.getElementById('delete-variant').addEventListener('click', requestVariantDeletion);
document.getElementById('confirm-delete-variant').addEventListener('click', confirmVariantDeletion);
document.getElementById('cancel-delete-variant').addEventListener('click', cancelVariantDeletion);
document.getElementById('project-name').addEventListener('input', event => {
    project.name = event.target.value;
    renderVariants();
    if (!storageBlocked) setSaveStatus('dirty','Название изменено. Сохранение — после завершения ввода.');
});
document.getElementById('project-name').addEventListener('change', saveCommittedProject);
document.getElementById('retry-autosave').addEventListener('click', saveCommittedProject);
document.getElementById('replace-stored-project').addEventListener('click', () => {
    document.getElementById('storage-replacement-confirmation').hidden = false;
});
document.getElementById('confirm-storage-replacement').addEventListener('click', confirmStorageReplacement);
document.getElementById('cancel-storage-replacement').addEventListener('click', () => {
    document.getElementById('storage-replacement-confirmation').hidden = true;
});
document.getElementById('export-project').addEventListener('click', exportProject);
document.getElementById('import-project').addEventListener('change', readProjectFile);
document.getElementById('confirm-import').addEventListener('click', confirmProjectImport);
document.getElementById('cancel-import').addEventListener('click', cancelProjectImport);
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
        if (project.plot) saveCommittedProject();
    });
}
window.addEventListener('resize', render);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(plotContainer);
window.addEventListener('blur', cancelDrag);
restoreSavedProject();
render();

function render() {
    renderVariants();
    view = renderer.render(project, selectedId, highlightedType);
    renderObjectProperties();
    if (project.plot) {
        document.getElementById('create-plot').textContent = 'Изменить размеры';
        document.getElementById('plot-summary').textContent = `Текущий участок: ${project.plot.width} × ${project.plot.length} м`;
        document.getElementById('new-project').hidden = false;
    } else {
        document.getElementById('create-plot').textContent = 'Создать участок';
        document.getElementById('plot-summary').textContent = '';
        document.getElementById('new-project').hidden = true;
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
    saveCommittedProject();
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
    saveCommittedProject();
}

function confirmNewProject() {
    const dimensions = readDimensions('plot');
    if (!dimensions) return;
    cancelDrag();
    cancelProjectImport();
    project = YardMap.createProject();
    layouts.variants.find(item => item.id === layouts.activeId).project = project;
    cancelVariantDeletion();
    document.getElementById('project-name').value = project.name;
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
    storageBlocked = false;
    document.getElementById('storage-replacement-confirmation').hidden = true;
    saveCommittedProject();
}

function startDrag(event) {
    if (event.button !== 0 || !view) return;
    const id = event.currentTarget.dataset.id;
    const object = project.objects.find(item => item.id === id);
    if (!object) return;
    selectObject(id);
    event.currentTarget.focus?.();
    if (object.locked) { event.preventDefault(); return; }
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
    objectPanelDirty=false;
    render();
    if (!storageBlocked) showSaveStatus('dirty','Перемещение не сохранено. Отпустите мышь для сохранения.');
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
    saveCommittedProject();
}

function cancelDrag() {
    if (!activeDrag) return;
    Object.assign(project.objects.find(item => item.id === activeDrag.id), activeDrag.before);
    activeDrag = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    render();
    showSaveStatus(committedSaveStatus.state,committedSaveStatus.text);
}

function highlightBuildings(type) {
    highlightedType = type;
    render();
}

function stageProjectImport(text) {
    pendingImport = null;
    document.getElementById('import-confirmation').hidden = true;
    try {
        pendingImport = YardMap.parseProject(text);
        document.getElementById('import-summary').textContent = `Открыть «${pendingImport.name}»: ${pendingImport.plot ? `${pendingImport.plot.width} × ${pendingImport.plot.length} м` : 'без участка'}, объектов: ${pendingImport.objects.length}?`;
        document.getElementById('import-confirmation').hidden = false;
        document.getElementById('project-file-status').textContent = 'Файл проверен. Подтвердите замену текущего плана.';
    } catch (error) {
        document.getElementById('project-file-status').textContent = error.message;
    }
}
async function readProjectFile(event) {
    const file = event.target.files[0];
    cancelProjectImport();
    if (!file) return;
    const request = importRequest;
    document.getElementById('project-file-status').textContent = 'Чтение файла…';
    try {
        if (file.size > YardMap.maxProjectFileBytes) throw new Error('Файл проекта слишком большой (максимум 2 МиБ).');
        const text = await file.text();
        if (request === importRequest) stageProjectImport(text);
    } catch (error) {
        if (request === importRequest) document.getElementById('project-file-status').textContent = `Не удалось открыть файл: ${error.message}`;
    } finally {
        if (request === importRequest) event.target.value = '';
    }
}
function cancelProjectImport() {
    importRequest++;
    pendingImport = null;
    document.getElementById('import-confirmation').hidden = true;
    document.getElementById('project-file-status').textContent = '';
}
function confirmProjectImport() {
    if (!pendingImport) return;
    cancelDrag();
    project = pendingImport;
    layouts.variants.find(item => item.id === layouts.activeId).project = project;
    cancelVariantDeletion();
    cancelProjectImport();
    selectedId = null; highlightedType = null;
    syncProjectFields();
    render();
    storageBlocked = false;
    document.getElementById('storage-replacement-confirmation').hidden = true;
    saveCommittedProject();
    document.getElementById('project-file-status').textContent = `Открыт проект «${project.name}».`;
}
function syncProjectFields() {
    objectPanelId = null; objectPanelDirty = false; cancelObjectDeletion();
    document.getElementById('project-name').value = project.name;
    document.getElementById('new-project-confirmation').hidden = true;
    for (const side of ['north','east','south','west']) document.getElementById(`${side}-side`).value = project.plot?.borders[side] || '';
    document.getElementById('plot-width').value = String(project.plot?.width ?? 20);
    document.getElementById('plot-length').value = String(project.plot?.length ?? 35);
    for (const id of [...sizeFields,'building-type']) setFieldError(id,'');
    for (const id of ['building-section','waiting-section','rules-info']) document.getElementById(id).style.display = project.plot ? 'block' : 'none';
}
function exportProject() {
    cancelDrag();
    try {
        const text = YardMap.serializeProject(project);
        const url = URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
        const link = document.createElement('a');
        link.href = url; link.download = 'yardmap-project.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url),1000);
        document.getElementById('project-file-status').textContent = 'JSON подготовлен для скачивания. Сохраните файл на устройстве.';
    } catch (error) { document.getElementById('project-file-status').textContent = error.message; }
}

function showSaveStatus(state,text) {
    const status = document.getElementById('autosave-status');
    status.dataset.state = state; status.textContent = text;
    document.getElementById('retry-autosave').hidden = state !== 'error';
    document.getElementById('replace-stored-project').hidden = !storageBlocked;
}
function setSaveStatus(state,text) {
    committedSaveStatus = { state,text };
    showSaveStatus(state,text);
}
function restoreSavedProject() {
    const result = projectStore.load();
    if (result.state === 'loaded') {
        layouts = result.layouts;
        project = result.project;
        syncProjectFields();
        setSaveStatus('saved','Проект восстановлен из хранилища этого браузера.');
    } else if (result.state === 'blocked') {
        storageBlocked = true;
        setSaveStatus('blocked',`Сохранённый проект не удалось открыть: ${result.error} Автосохранение приостановлено; прежняя запись сохранена до подтверждения замены.`);
    } else setSaveStatus('empty','Сохранённого проекта пока нет. Изменения будут сохраняться в этом браузере.');
}
function saveCommittedProject() {
    if (storageBlocked) return;
    // Other completed edits may occur during a drag; persist its starting footprint.
    const snapshot = activeDrag ? { ...project, objects: project.objects.map(object =>
        object.id === activeDrag.id ? activeDrag.before : object) } : project;
    const storedLayouts = { ...layouts, variants: layouts.variants.map(item =>
        item.id === layouts.activeId ? { ...item, project: snapshot } : item) };
    const result = projectStore.save(storedLayouts);
    if (result.ok) {
        setSaveStatus('saved','Сохранено в этом браузере.');
        if (activeDrag) showSaveStatus('dirty','Завершённые изменения сохранены. Текущее перемещение сохранится после отпускания мыши.');
    }
    else setSaveStatus('error',`Не удалось сохранить проект: ${result.error} Изменения доступны в редакторе; скачайте JSON или повторите сохранение.`);
}
function confirmStorageReplacement() {
    cancelDrag();
    storageBlocked = false;
    document.getElementById('storage-replacement-confirmation').hidden = true;
    saveCommittedProject();
}

function renderVariants() {
    const select = document.getElementById('variant-select');
    select.replaceChildren();
    for (const variant of layouts.variants) {
        const plan = variant.id === layouts.activeId ? project : variant.project;
        const option = document.createElement('option'); option.value = variant.id;
        const area = plan.plot ? `${Number((plan.plot.width * plan.plot.length).toFixed(2))} м²` : 'без участка';
        option.textContent = `${plan.name} — объектов: ${plan.objects.length}, ${area}`;
        select.appendChild(option);
        if (variant.id === layouts.activeId) document.getElementById('active-variant-summary').textContent = `Активный вариант: ${option.textContent}`;
    }
    select.value = layouts.activeId;
    document.getElementById('delete-variant').disabled = layouts.variants.length <= 1;
    for (const id of ['create-variant','copy-variant']) document.getElementById(id).disabled = layouts.variants.length >= YardMap.maxVariants;
}
function prepareVariantChange() {
    cancelDrag();
    try { YardMap.serializeProject(project); }
    catch (error) {
        document.getElementById('variant-status').textContent = error.message;
        renderVariants(); return false;
    }
    cancelProjectImport(); cancelVariantDeletion();
    document.getElementById('variant-status').textContent = '';
    document.getElementById('new-project-confirmation').hidden = true;
    return true;
}
function switchVariant(id) {
    const variant = layouts.variants.find(item => item.id === id);
    if (!variant || id === layouts.activeId || !prepareVariantChange()) return;
    layouts.activeId = id; project = variant.project;
    selectedId = null; highlightedType = null;
    syncProjectFields(); render(); saveCommittedProject();
}
function addVariant(plan) {
    const id = `variant-${layouts.nextVariantId++}`;
    layouts.variants.push({ id, project: plan }); layouts.activeId = id; project = plan;
    selectedId = null; highlightedType = null;
    syncProjectFields(); render(); saveCommittedProject();
}
function createVariant() {
    if (layouts.variants.length >= YardMap.maxVariants || !prepareVariantChange()) return;
    const plan = YardMap.createProject();
    plan.name = `Вариант ${layouts.nextVariantId}`;
    plan.plot = project.plot ? JSON.parse(JSON.stringify(project.plot)) : null;
    plan.settings = { ...project.settings };
    addVariant(plan);
}
function copyVariant() {
    if (layouts.variants.length >= YardMap.maxVariants || !prepareVariantChange()) return;
    const plan = YardMap.cloneProject(project);
    plan.name = project.name.slice(0,190) + ' (копия)';
    addVariant(plan);
}
function requestVariantDeletion() {
    if (layouts.variants.length <= 1) return;
    cancelDrag();
    pendingVariantDeletion = layouts.activeId;
    document.getElementById('variant-delete-summary').textContent = `Удалить вариант «${project.name}» (${project.objects.length} объектов)?`;
    document.getElementById('variant-delete-confirmation').hidden = false;
}
function cancelVariantDeletion() {
    pendingVariantDeletion = null;
    document.getElementById('variant-delete-confirmation').hidden = true;
}
function confirmVariantDeletion() {
    if (pendingVariantDeletion !== layouts.activeId || layouts.variants.length <= 1) return;
    cancelDrag(); cancelProjectImport();
    layouts.variants = layouts.variants.filter(item => item.id !== pendingVariantDeletion);
    cancelVariantDeletion();
    layouts.activeId = layouts.variants[0].id; project = layouts.variants[0].project;
    selectedId = null; highlightedType = null;
    syncProjectFields(); render(); saveCommittedProject();
}

function selectedObject() { return project.objects.find(object=>object.id===selectedId); }
function selectObject(id) {
    if(selectedId===id && !activeDrag)return;
    cancelDrag(); cancelObjectDeletion();
    selectedId = project.objects.some(object=>object.id===id) ? id : null;
    objectPanelDirty=false; objectPanelId=null;
    render();
    renderer.elements.get(selectedId)?.focus?.();
}
function renderObjectProperties() {
    const select=document.getElementById('object-select');select.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='Выберите объект';select.appendChild(empty);
    for(const object of project.objects) {
        const option=document.createElement('option');option.value=object.id;
        option.textContent=`${object.name} — ${object.width} × ${object.length} м${object.locked?' (закреплён)':''}`;
        select.appendChild(option);
    }
    const object=selectedObject(); select.value=object?.id || '';
    document.getElementById('object-properties').hidden=!object;
    if (!object) { objectPanelId=null; cancelObjectDeletion(); return; }
    if (objectPanelId!==object.id || !objectPanelDirty) {
        if(objectPanelId!==object.id) document.getElementById('object-properties-error').textContent='';
        objectPanelId=object.id;objectPanelDirty=false;
        for(const field of ['name','width','length','x','y','rotation','status']) document.getElementById(`object-${field}`).value=object[field]===null?'':String(object[field]);
    }
    updatePositionInputs();
    document.getElementById('rotate-object').disabled=object.locked;
    document.getElementById('lock-object').textContent=object.locked?'Разблокировать положение':'Закрепить положение';
    document.getElementById('lock-object').setAttribute('aria-pressed',String(object.locked));
    const offsets=object.status==='placed'?YardMap.borderDistances(project.plot,object):null;
    const names={left:'Запад',top:'Север',right:'Восток',bottom:'Юг'};
    document.getElementById('object-offsets').textContent=offsets
        ? 'Отступы до сторон: '+Object.entries(offsets).map(([side,value])=>`${names[side]}: ${Number(value.toPrecision(12))} м`).join('; ')
        : 'Объект в ожидании: координаты и отступы не заданы.';
}
function updatePositionInputs() {
    const object=selectedObject();if(!object)return;
    const waiting=document.getElementById('object-status').value==='waiting';
    for(const field of ['x','y']) {
        const input=document.getElementById(`object-${field}`); input.disabled=waiting || object.locked;
    }
    document.getElementById('object-status').disabled=object.locked;
    document.getElementById('object-rotation').disabled=object.locked;
}
function editSelectedObject(action) {
    cancelDrag();
    const object=selectedObject();if(!object)return;
    try {
        action(object);objectPanelDirty=false;cancelObjectDeletion();
        document.getElementById('object-properties-error').textContent='';
        render();saveCommittedProject();
    } catch(error) { document.getElementById('object-properties-error').textContent=error.message; }
}
function applyObjectProperties() {
    editSelectedObject(object=>{
        const value=field=>document.getElementById(`object-${field}`).value;
        const status=value('status');
        if(status==='placed' && (!value('x').trim() || !value('y').trim())) throw new Error('Укажите координаты X и Y.');
        YardMap.updateObject(project,object.id,{name:value('name'),width:Number(value('width')),length:Number(value('length')),
            rotation:Number(value('rotation')),status,x:status==='waiting'?null:Number(value('x')),y:status==='waiting'?null:Number(value('y'))});
    });
}
function rotateSelectedObject() { editSelectedObject(object=>YardMap.updateObject(project,object.id,{rotation:(object.rotation+90)%360})); }
function copySelectedObject() { editSelectedObject(object=>{ selectedId=YardMap.copyObject(project,object.id).id; }); }
function toggleObjectLock() { editSelectedObject(object=>YardMap.updateObject(project,object.id,{locked:!object.locked})); }
function requestObjectDeletion() {
    cancelDrag();const object=selectedObject();if(!object)return;
    pendingObjectDeletion=object.id;
    document.getElementById('object-delete-summary').textContent=`Удалить «${object.name}» из активного варианта?`;
    document.getElementById('object-delete-confirmation').hidden=false;
}
function cancelObjectDeletion() { pendingObjectDeletion=null; document.getElementById('object-delete-confirmation').hidden=true; }
function confirmObjectDeletion() {
    if(!pendingObjectDeletion || pendingObjectDeletion!==selectedId)return;
    editSelectedObject(object=>{YardMap.deleteObject(project,object.id);selectedId=null;});
}
function handleObjectKeyDown(event) {
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!directions[event.key] || activeDrag || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)return;
    const target=event.target;
    if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(target?.tagName) || target?.isContentEditable)return;
    const object=selectedObject();if(!object || object.status!=='placed' || object.locked)return;
    event.preventDefault();const step=Number(document.getElementById('object-move-step').value);
    if(!Number.isFinite(step) || step<=0) {document.getElementById('object-properties-error').textContent='Шаг перемещения должен быть положительным числом.';return;}
    const [dx,dy]=directions[event.key];
    editSelectedObject(item=>YardMap.placeObject(project,item.id,item.x+dx*step,item.y+dy*step));
}
