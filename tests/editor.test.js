const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Small DOM boundary; geometry assertions below use real project behaviour,
// not CSS layout. Actual layout and dragging are also checked in the browser.
function editor(options = {}) {
    const ids = new Map();
    const downloads = [], blobs = new Map();
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag;
            this.style = { setProperty() {} };
            this.dataset = {};
            this.children = [];
            this.className = '';
            this.value = '';
            this.textContent = '';
            this.clientWidth = 650;
            this.clientHeight = 500;
            this.listeners = {};
            this.classList = {
                contains: name => this.className.split(' ').includes(name),
                toggle: (name, enabled) => {
                    const names = new Set(this.className.split(' ').filter(Boolean));
                    if (enabled) names.add(name); else names.delete(name);
                    this.className = [...names].join(' ');
                }
            };
        }
        addEventListener(type, fn) { this.listeners[type] = fn; }
        removeEventListener(type) { delete this.listeners[type]; }
        setAttribute(name, value) { this[name] = value; }
        click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }
        appendChild(child) {
            child.remove();
            child.parentElement = this;
            this.children.push(child);
            return child;
        }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        replaceChildren(...children) {
            this.children.forEach(child => { child.parentElement = null; });
            this.children = [];
            this.append(...children);
        }
        remove() {
            if (this.parentElement) {
                const parent = this.parentElement;
                parent.children = parent.children.filter(child => child !== this);
                this.parentElement = null;
            }
        }
        set innerHTML(value) { this.replaceChildren(); }
        get innerHTML() { return ''; }
        get offsetLeft() { return parseFloat(this.style.left) || 0; }
        get offsetTop() { return parseFloat(this.style.top) || 0; }
        get offsetWidth() { return parseFloat(this.style.width) || 0; }
        get offsetHeight() { return parseFloat(this.style.height) || 0; }
        getBoundingClientRect() {
            return {
                left: this.offsetLeft, top: this.offsetTop,
                right: this.offsetLeft + this.offsetWidth,
                bottom: this.offsetTop + this.offsetHeight,
                width: this.offsetWidth || this.clientWidth,
                height: this.offsetHeight || this.clientHeight
            };
        }
    }
    const get = id => {
        if (!ids.has(id)) ids.set(id, new Element());
        return ids.get(id);
    };
    const container = get('container');
    container.appendChild(get('plot'));
    const all = () => {
        const found = new Set();
        function visit(el) { if (found.has(el)) return; found.add(el); el.children.forEach(visit); }
        ids.forEach(visit);
        return [...found];
    };
    const document = {
        body: new Element('body'),
        getElementById: get,
        querySelector: () => container,
        querySelectorAll: selector => selector.startsWith('#')
            ? selector.split(',').map(s => get(s.trim().slice(1)))
            : all().filter(el => el.classList.contains(selector.slice(1))),
        createElement: tag => new Element(tag),
        addEventListener() {}, removeEventListener() {}
    };
    const alerts = [];
    const storage = options.storage || memoryStorage();
    const testWindow = { addEventListener() {} };
    Object.defineProperty(testWindow,'localStorage',{ get() {
        if (options.storageAccessError) throw new Error('Storage access denied');
        return storage;
    } });
    const context = vm.createContext({ document, console, Blob,
        URL: { createObjectURL(blob) { const url='blob:'+blobs.size; blobs.set(url,blob); return url; }, revokeObjectURL() {} },
        setTimeout(fn) { fn(); }, alert(message) { alerts.push(message); }, window: testWindow });
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const run = code => vm.runInContext(code, context);
    get('plot-width').value = '20'; get('plot-length').value = '35';
    get('building-type').value = 'house';
    for (const id of ['building-width', 'building-length']) {
        get(id).value = html.match(new RegExp(`<input[^>]+id="${id}"[^>]+value="([^"]+)"`))[1];
    }
    for (const [, src] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
    }
    if (!options.bootOnly) run('createPlot()');
    return {
        get, run, alerts, downloads,
        add() { run('createBuilding()'); },
        state() {
            return run('typeof project === "undefined" ? {objects: buildings} : project');
        },
        place(x, y) {
            const element = document.querySelectorAll('.building')[0];
            const start = element.getBoundingClientRect();
            context.event = { button: 0, currentTarget: element, clientX: start.left, clientY: start.top, preventDefault() {} };
            run('startDrag(event)');
            const target = run(`typeof view === 'undefined' ? {x:plotElement.offsetLeft + ${x} * scaleFactor, y:plotElement.offsetTop + ${y} * scaleFactor} : YardMap.toScreen({x:${x},y:${y}}, view)`);
            context.event = { clientX: target.x, clientY: target.y };
            run('drag(event); stopDrag()');
        }
    };
}

function memoryStorage(initial = null) {
    const data = new Map(initial === null ? [] : [['yardmap.project.v1',initial]]);
    return { data, writes: 0, failWrites: false,
        getItem(key) { return data.get(key) ?? null; },
        setItem(key,value) { if(this.failWrites) throw new Error('Quota exceeded'); this.writes++; data.set(key,value); }
    };
}
function savedProject(text) {
    const data=JSON.parse(text);
    return data.workspaceVersion ? data.variants.find(item=>item.id===data.activeId).project : data;
}

test('history undoes and redoes add, drag, rotation and deletion with saved state', () => {
    const storage=memoryStorage(),app=editor({storage});
    assert.equal(app.run('typeof undoAction'),'function','undo is available');
    const baseline=JSON.stringify(app.state());
    app.add(); const added=JSON.stringify(app.state());
    app.place(4,5); const placed=JSON.stringify(app.state());
    app.run('rotateSelectedObject()');const rotated=JSON.stringify(app.state());
    app.run('requestObjectDeletion(); confirmObjectDeletion()');const removed=JSON.stringify(app.state());
    for(const expected of [rotated,placed,added,baseline]) {
        app.run('undoAction()');assert.equal(JSON.stringify(app.state()),expected);
        assert.equal(JSON.stringify(savedProject(storage.data.get('yardmap.project.v1'))),expected);
    }
    for(const expected of [added,placed,rotated,removed]) {app.run('redoAction()');assert.equal(JSON.stringify(app.state()),expected);}
    assert.equal(app.get('redo-action').disabled,true);
});

test('history records dimensions, borders, properties and clears redo only for a real edit', () => {
    const app=editor();assert.equal(app.run('typeof undoAction'),'function','undo is available');
    app.add();app.place(18,5);const original=JSON.stringify(app.state());
    app.get('plot-width').value='30';app.run('createPlot()');
    app.get('north-side').listeners.change({target:{value:'road'}});
    app.get('object-name').value='Дом у дороги';app.get('object-width').value='7';app.run('applyObjectProperties()');
    app.run('undoAction()');assert.equal(app.state().objects[0].name,'Дом');
    app.run('undoAction()');assert.equal(app.state().plot.borders.north,'');
    app.run('undoAction()');assert.equal(JSON.stringify(app.state()),original);
    assert.match(app.get('outside-warning').textContent,/За границами/);
    app.get('building-width').value='0';app.add();app.run('render()');
    assert.equal(app.get('redo-action').disabled,false);
    app.get('plot-width').value='25';app.run('createPlot()');
    assert.equal(app.get('redo-action').disabled,true);
});

test('history coalesces drag frames, ignores cancellation and preserves interleaved committed edits', () => {
    const app=editor();assert.equal(app.run('typeof undoAction'),'function','undo is available');
    app.add();app.place(4,5);const original=JSON.stringify(app.state());
    app.run(`event={button:0,currentTarget:renderer.elements.get(selectedId),clientX:0,clientY:0,preventDefault(){}};startDrag(event);
        drag({clientX:250,clientY:200});drag({clientX:260,clientY:210});stopDrag();undoAction()`);
    assert.equal(JSON.stringify(app.state()),original);
    app.run(`event={button:0,currentTarget:renderer.elements.get(selectedId),clientX:0,clientY:0,preventDefault(){}};startDrag(event);
        drag({clientX:250,clientY:200});cancelDrag()`);
    assert.equal(app.get('redo-action').disabled,false);
    app.run(`event={button:0,currentTarget:renderer.elements.get(selectedId),clientX:0,clientY:0,preventDefault(){}};startDrag(event);
        drag({clientX:250,clientY:200})`);
    app.add();app.run('stopDrag();undoAction()');
    assert.equal(app.state().objects.length,2);
    assert.equal(JSON.stringify(app.state().objects[0]),JSON.stringify(JSON.parse(original).objects[0]));
    app.run('undoAction()');assert.equal(JSON.stringify(app.state()),original);
});

test('history resets at variant, import, new-project and reload boundaries', () => {
    const app=editor();assert.equal(app.run('typeof undoAction'),'function','undo is available');
    app.add();const old=JSON.stringify(app.state());
    app.run('copyVariant()');assert.equal(app.get('undo-action').disabled,true);
    app.add();app.run('switchVariant("variant-1")');assert.equal(app.get('undo-action').disabled,true);
    app.run('undoAction()');assert.equal(JSON.stringify(app.state()),old);
    app.add();app.run(`stageProjectImport(${JSON.stringify(old)});cancelProjectImport()`);
    assert.equal(app.get('undo-action').disabled,false);
    app.run(`stageProjectImport(${JSON.stringify(old)});confirmProjectImport()`);
    assert.equal(app.get('undo-action').disabled,true);
    app.add();app.run('confirmNewProject()');assert.equal(app.get('undo-action').disabled,true);
    const storage=memoryStorage();const first=editor({storage});first.add();
    const reloaded=editor({storage,bootOnly:true});assert.equal(reloaded.get('undo-action').disabled,true);
});

test('history keyboard shortcuts respect text controls and support both redo combinations', () => {
    const app=editor();app.add();assert.equal(app.run('typeof handleHistoryKeyDown'),'function','history shortcuts are available');
    const before=JSON.stringify(app.state());
    app.run(`handleHistoryKeyDown({key:'z',ctrlKey:true,target:{tagName:'INPUT'},preventDefault(){throw Error('text intercepted')}})`);
    assert.equal(JSON.stringify(app.state()),before);
    app.run(`handleHistoryKeyDown({key:'z',ctrlKey:true,target:{tagName:'DIV'},preventDefault(){}})`);
    assert.equal(app.state().objects.length,0);
    app.run(`handleHistoryKeyDown({key:'z',metaKey:true,shiftKey:true,target:{tagName:'DIV'},preventDefault(){}})`);
    assert.equal(JSON.stringify(app.state()),before);
    app.run(`undoAction();handleHistoryKeyDown({key:'y',ctrlKey:true,target:{tagName:'DIV'},preventDefault(){}})`);
    assert.equal(JSON.stringify(app.state()),before);
});

test('history remains usable when autosave fails and does not change another variant', () => {
    const storage=memoryStorage(),app=editor({storage});app.add();
    app.run('copyVariant()');const originalVariant=app.run('JSON.stringify(layouts.variants[0].project)');
    app.add();storage.failWrites=true;app.run('undoAction()');
    assert.equal(app.state().objects.length,1);
    assert.equal(app.get('autosave-status').dataset.state,'error');
    app.run('redoAction()');assert.equal(app.state().objects.length,2);
    assert.equal(app.run('JSON.stringify(layouts.variants[0].project)'),originalVariant);
    storage.failWrites=false;app.run('saveCommittedProject()');
    assert.equal(savedProject(storage.data.get('yardmap.project.v1')).objects.length,2);
});

test('placement coordinate drafts keep empty input until apply instead of replacing it with zero', () => {
    const app=editor();app.add();
    app.get('object-status').value='placed';app.get('object-status').listeners.change();
    app.get('object-x').value='';app.get('object-x').listeners.input();
    assert.equal(app.get('object-x').value,'');
    const before=JSON.stringify(app.state());app.run('applyObjectProperties()');
    assert.equal(JSON.stringify(app.state()),before);
    assert.match(app.get('object-properties-error').textContent,/координаты/);
});

test('object properties select individual objects and apply exact geometry with live offsets', () => {
    const app=editor();app.add();app.place(4,5);app.add();
    assert.equal(app.run('typeof selectObject'),'function','individual object selection is available');
    const id=app.state().objects[0].id;app.run(`selectObject(${JSON.stringify(id)})`);
    assert.equal(app.get('object-name').value,'Дом');
    app.get('object-name').value='Наш дом';app.get('object-width').value='5.25';app.get('object-length').value='6.5';
    app.get('object-x').value='3.125';app.get('object-y').value='4.75';app.get('object-rotation').value='90';
    app.run('applyObjectProperties()');
    const object=app.state().objects[0];
    assert.equal(object.name,'Наш дом');assert.equal(object.width,5.25);assert.equal(object.rotation,90);
    assert.equal(object.x,3.125);assert.equal(object.y,4.75);
    assert.match(app.get('object-offsets').textContent,/10.375/);
    assert.equal(app.run('document.querySelectorAll(".selected-building").length'),1);
    assert.equal(app.run('document.querySelectorAll(".building-name")[0].textContent'),'Наш дом');
});
test('object properties reject invalid edits atomically and synchronize after dragging', () => {
    const app=editor();app.add();app.place(4,5);
    assert.equal(app.run('typeof applyObjectProperties'),'function','validated property edits are available');
    const before=JSON.stringify(app.state());app.get('object-width').value='0';app.get('object-x').value='12';
    app.run('applyObjectProperties()');
    assert.equal(JSON.stringify(app.state()),before);assert.match(app.get('object-properties-error').textContent,/положитель/);
    app.place(8,9);
    assert.ok(Math.abs(Number(app.get('object-x').value)-8)<1e-9);
    assert.ok(Math.abs(Number(app.get('object-y').value)-9)<1e-9);
});
test('object properties rotate contours, copy with new identity and delete after confirmation', () => {
    const app=editor();app.add();app.place(14,28);
    assert.equal(app.run('typeof rotateSelectedObject'),'function','rotation is available');
    const id=app.state().objects[0].id;app.run('rotateSelectedObject()');
    assert.equal(app.state().objects[0].rotation,90);
    assert.equal(app.run('YardMap.objectSize(project.objects[0]).width'),6);
    app.run('copySelectedObject()');const copy=app.state().objects[1];
    assert.notEqual(copy.id,id);assert.equal(copy.rotation,90);assert.equal(copy.status,'waiting');
    app.run('requestObjectDeletion()');assert.equal(app.state().objects.length,2);
    app.run('confirmObjectDeletion()');assert.equal(app.state().objects.length,1);
    assert.equal(app.state().objects[0].id,id);assert.equal(app.run('selectedId'),null);
});
test('object properties lock position across drag, keyboard, JSON and reload', () => {
    const storage=memoryStorage(),app=editor({storage});app.add();app.place(4,5);
    assert.equal(app.run('typeof toggleObjectLock'),'function','position lock is available');
    app.run('toggleObjectLock()');const before=JSON.stringify(app.state().objects[0]);
    app.place(8,9);
    app.run('handleObjectKeyDown({key:"ArrowRight",target:{tagName:"DIV"},preventDefault(){}})');
    assert.equal(JSON.stringify(app.state().objects[0]),before);assert.equal(app.run('activeDrag'),null);
    const restored=editor({storage,bootOnly:true});assert.equal(restored.state().objects[0].locked,true);
    assert.equal(app.run('YardMap.parseProject(YardMap.serializeProject(project)).objects[0].locked'),true);
    app.run('toggleObjectLock()');app.place(8,9);assert.ok(Math.abs(app.state().objects[0].x-8)<1e-9);
});
test('object properties keyboard uses visible metre step and ignores editing controls', () => {
    const app=editor();app.add();app.place(4,5);
    assert.equal(app.run('typeof handleObjectKeyDown'),'function','keyboard movement is available');
    app.get('object-move-step').value='0.25';
    const x=app.state().objects[0].x;
    app.run('handleObjectKeyDown({key:"ArrowRight",target:{tagName:"INPUT"},preventDefault(){throw Error("must not intercept")}})');
    assert.equal(app.state().objects[0].x,x);
    app.run('handleObjectKeyDown({key:"ArrowRight",target:{tagName:"DIV"},preventDefault(){}})');
    assert.equal(app.state().objects[0].x,x+0.25);
    app.get('object-move-step').value='0';const before=JSON.stringify(app.state());
    app.run('handleObjectKeyDown({key:"ArrowRight",target:{tagName:"DIV"},preventDefault(){}})');
    assert.equal(JSON.stringify(app.state()),before);
});

test('variants copy independently, rename, switch and restore every layout on reload', () => {
    const storage=memoryStorage(),app=editor({storage}); app.add(); app.place(4,5);
    assert.equal(app.run('typeof copyVariant'),'function','copy variant action is available');
    const originalId=app.run('layouts.activeId'),original=JSON.stringify(app.state());
    app.run('copyVariant()'); const copyId=app.run('layouts.activeId');
    assert.notEqual(copyId,originalId); app.place(8,9);
    app.get('project-name').listeners.input({target:{value:'Другой дом'}});
    app.get('project-name').listeners.change();
    app.run(`switchVariant(${JSON.stringify(originalId)})`);
    assert.equal(JSON.stringify(app.state()),original);
    app.run(`switchVariant(${JSON.stringify(copyId)})`);
    assert.equal(app.state().name,'Другой дом');
    const copy=JSON.stringify(app.state());
    const restored=editor({storage,bootOnly:true});
    assert.equal(restored.run('layouts.activeId'),copyId);
    assert.equal(JSON.stringify(restored.state()),copy);
    restored.run(`switchVariant(${JSON.stringify(originalId)})`);
    assert.equal(JSON.stringify(restored.state()),original);
    assert.match(restored.get('active-variant-summary').textContent,/700/);
    assert.equal(restored.get('variant-select').children.length,2);
});
test('variants create blank layouts and delete only after confirmation with export available', async () => {
    const storage=memoryStorage(),app=editor({storage}); app.add();
    assert.equal(app.run('typeof createVariant'),'function','new variant action is available');
    const originalId=app.run('layouts.activeId');
    app.run('createVariant()'); const emptyId=app.run('layouts.activeId');
    assert.equal(app.state().objects.length,0); assert.equal(app.state().plot.width,20);
    app.run(`switchVariant(${JSON.stringify(originalId)}); requestVariantDeletion()`);
    assert.equal(app.run('layouts.variants.length'),2);
    app.run('exportProject()');
    assert.equal(JSON.parse(await app.downloads[0].blob.text()).objects.length,1);
    app.run('cancelVariantDeletion()'); assert.equal(app.run('layouts.variants.length'),2);
    app.run('requestVariantDeletion(); confirmVariantDeletion()');
    assert.equal(app.run('layouts.activeId'),emptyId); assert.equal(app.run('layouts.variants.length'),1);
    app.run('requestVariantDeletion(); confirmVariantDeletion()');
    assert.equal(app.run('layouts.variants.length'),1);
    const restored=editor({storage,bootOnly:true});
    assert.equal(restored.run('layouts.variants.length'),1);
});
test('variants migrate old autosave without rewriting it on startup and preserve it on errors', () => {
    const old=fs.readFileSync(path.join(__dirname,'../examples/garden.json'),'utf8');
    const storage=memoryStorage(old),app=editor({storage,bootOnly:true});
    assert.equal(app.run('typeof layouts'),'object','variant collection is available');
    assert.equal(app.run('layouts.variants.length'),1); assert.equal(app.state().name,'Сад у озера');
    assert.equal(storage.getItem('yardmap.project.v1'),old); assert.equal(storage.writes,0);
    app.run('copyVariant()');
    assert.equal(editor({storage,bootOnly:true}).run('layouts.variants.length'),2);
});
test('variants switching cancels unfinished drag and staged import without changing another layout', () => {
    const app=editor(); app.add(); app.place(4,5);
    assert.equal(app.run('typeof copyVariant'),'function','switchable variants are available');
    const id=app.run('layouts.activeId'); app.run('copyVariant()');
    const copyId=app.run('layouts.activeId');
    app.run('activeDrag={id:project.objects[0].id,before:{...project.objects[0]},offsetX:0,offsetY:0}; drag({clientX:view.left+8*view.scale,clientY:view.top+9*view.scale})');
    app.run(`stageProjectImport(YardMap.serializeProject(YardMap.createProject())); switchVariant(${JSON.stringify(id)})`);
    assert.equal(app.run('activeDrag'),null); assert.equal(app.run('pendingImport'),null);
    assert.equal(app.run('selectedId'),null);
    app.run(`switchVariant(${JSON.stringify(copyId)})`);
    assert.ok(Math.abs(app.state().objects[0].x-4)<1e-9);
});

test('autosave restores completed geometry, borders, names and waiting objects on reload', () => {
    const storage=memoryStorage(), app=editor({storage}); app.add(); app.place(4.25,5.5); app.add();
    assert.equal(typeof app.get('project-name').listeners.change,'function','finished name edits trigger persistence');
    app.get('project-name').listeners.input({target:{value:'Сад'}});
    app.get('project-name').listeners.change({target:{value:'Сад'}});
    app.get('north-side').value='road'; app.get('north-side').listeners.change({target:app.get('north-side')});
    app.get('plot-width').value='25.5'; app.run('createPlot()');
    assert.ok(storage.writes>0,'completed changes are written to storage');
    const restored=editor({storage,bootOnly:true});
    assert.equal(JSON.stringify(restored.state()),JSON.stringify(app.state()));
    assert.equal(restored.get('project-name').value,'Сад');
    assert.equal(restored.get('plot-width').value,'25.5');
    assert.equal(restored.get('north-side').value,'road');
    assert.equal(restored.run('document.querySelectorAll(".waiting-building").length'),1);
    assert.equal(restored.get('autosave-status').dataset.state,'saved');
});

// Additional variant checks after the unchanged focused cycle.
test('active-layout import and new project preserve other variants and failed writes retain all layouts in memory', () => {
    const storage=memoryStorage(),app=editor({storage}); app.add();
    const originalId=app.run('layouts.activeId'),original=JSON.stringify(app.state());
    app.run('copyVariant(); confirmNewProject()');
    assert.equal(app.state().objects.length,0);
    app.run(`stageProjectImport(${JSON.stringify(original)}); confirmProjectImport()`);
    app.run(`switchVariant(${JSON.stringify(originalId)})`);
    assert.equal(JSON.stringify(app.state()),original);
    const saved=storage.getItem('yardmap.project.v1');storage.failWrites=true;
    app.run('copyVariant()');
    assert.equal(app.run('layouts.variants.length'),3);
    assert.equal(app.get('autosave-status').dataset.state,'error');
    assert.equal(storage.getItem('yardmap.project.v1'),saved);
    storage.failWrites=false;app.run('saveCommittedProject()');
    assert.equal(editor({storage,bootOnly:true}).run('layouts.variants.length'),3);
});
test('invalid layout name prevents switching and switching cancels a stale deletion confirmation', () => {
    const app=editor();const originalId=app.run('layouts.activeId');app.run('copyVariant()');
    const copyId=app.run('layouts.activeId');
    app.get('project-name').listeners.input({target:{value:''}});
    app.run(`switchVariant(${JSON.stringify(originalId)})`);
    assert.equal(app.run('layouts.activeId'),copyId);
    assert.match(app.get('variant-status').textContent,/Название/);
    app.get('project-name').listeners.input({target:{value:'Копия'}});
    app.run(`requestVariantDeletion(); switchVariant(${JSON.stringify(originalId)}); confirmVariantDeletion()`);
    assert.equal(app.run('layouts.variants.length'),2);
});

test('autosave stores only finished drags and preserves the saved snapshot on cancellation', () => {
    const storage=memoryStorage(), app=editor({storage}); app.add(); app.place(4,5);
    const before=storage.getItem('yardmap.project.v1'), writes=storage.writes;
    assert.ok(before,'a committed project is saved');
    app.run('activeDrag={id:project.objects[0].id,before:{...project.objects[0]},offsetX:0,offsetY:0}; drag({clientX:view.left+8*view.scale,clientY:view.top+9*view.scale})');
    assert.equal(storage.getItem('yardmap.project.v1'),before); assert.equal(storage.writes,writes);
    const reloaded=editor({storage,bootOnly:true});
    assert.equal(reloaded.state().objects[0].x,savedProject(before).objects[0].x);
    app.run('cancelDrag()');
    assert.equal(storage.getItem('yardmap.project.v1'),before);
    app.run('activeDrag={id:project.objects[0].id,before:{...project.objects[0]},offsetX:0,offsetY:0}; drag({clientX:view.left+8*view.scale,clientY:view.top+9*view.scale}); stopDrag()');
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects[0].x,app.state().objects[0].x);
});

test('autosave protects damaged or unsupported saved data until explicit replacement', () => {
    for(const raw of ['{','{"version":99}']) {
        const storage=memoryStorage(raw),app=editor({storage,bootOnly:true});
        assert.equal(app.get('autosave-status').dataset.state,'blocked');
        app.run('createPlot(); createBuilding()');
        assert.equal(storage.getItem('yardmap.project.v1'),raw); assert.equal(storage.writes,0);
        app.run('confirmStorageReplacement()');
        assert.notEqual(storage.getItem('yardmap.project.v1'),raw);
        assert.equal(app.get('autosave-status').dataset.state,'saved');
    }
});

test('autosave failure leaves editor and JSON export usable and retry can succeed', async () => {
    const storage=memoryStorage(),app=editor({storage}); const before=storage.getItem('yardmap.project.v1');
    storage.failWrites=true; app.add();
    assert.equal(app.get('autosave-status').dataset.state,'error');
    assert.equal(storage.getItem('yardmap.project.v1'),before);
    app.run('exportProject()');
    assert.equal(JSON.parse(await app.downloads[0].blob.text()).objects.length,1);
    storage.failWrites=false; app.run('saveCommittedProject()');
    assert.equal(app.get('autosave-status').dataset.state,'saved');
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects.length,1);
    const denied=editor({storageAccessError:true}); denied.add();
    assert.equal(denied.state().objects.length,1);
    assert.notEqual(denied.get('autosave-status').dataset.state,'saved');
});

test('autosave changes stored project only after new-project or import confirmation', () => {
    const storage=memoryStorage(),app=editor({storage}); app.add();
    const before=storage.getItem('yardmap.project.v1');
    assert.ok(before,'current project is saved');
    app.get('new-project').listeners.click(); app.get('cancel-new-project').listeners.click();
    assert.equal(storage.getItem('yardmap.project.v1'),before);
    app.run('confirmNewProject()');
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects.length,0);
    app.run(`stageProjectImport(${JSON.stringify(JSON.stringify(savedProject(before)))}); cancelProjectImport()`);
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects.length,0);
    app.run(`stageProjectImport(${JSON.stringify(JSON.stringify(savedProject(before)))}); confirmProjectImport()`);
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects.length,1);
});

// Additional characterization after the focused autosave cycle.
test('storage writes exclude invalid forms, selection and resize, and preserve a dragged footprint during another edit', () => {
    const storage=memoryStorage(),app=editor({storage}); app.add(); app.place(4,5);
    const before=storage.getItem('yardmap.project.v1'),writes=storage.writes;
    app.get('plot-width').value='0'; app.run('createPlot(); highlightBuildings("house"); render()');
    assert.equal(storage.writes,writes); assert.equal(storage.getItem('yardmap.project.v1'),before);
    app.run('activeDrag={id:project.objects[0].id,before:{...project.objects[0]},offsetX:0,offsetY:0}; drag({clientX:view.left+8*view.scale,clientY:view.top+9*view.scale})');
    app.add();
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects[0].x,savedProject(before).objects[0].x);
    assert.equal(savedProject(storage.getItem('yardmap.project.v1')).objects.length,2);
    assert.equal(app.get('autosave-status').dataset.state,'dirty');
    app.run('cancelDrag()');
    assert.equal(app.get('autosave-status').dataset.state,'saved');
});
test('storage restore does not write and a fully removed object reloads as waiting', () => {
    const storage=memoryStorage(),app=editor({storage}); app.add(); app.place(4,5); app.place(-100,-100);
    const writes=storage.writes,restored=editor({storage,bootOnly:true});
    assert.equal(storage.writes,writes);
    assert.equal(restored.state().objects[0].status,'waiting');
    assert.equal(restored.state().objects[0].x,null);
    assert.equal(restored.run('document.querySelectorAll(".waiting-building").length'),1);
});

test('project objects are DOM-free data with stable identity and waiting state', () => {
    const app = editor(); app.add();
    const object = app.state().objects[0];
    assert.equal('element' in object, false, 'DOM must stay outside the project model');
    assert.equal(typeof object.id, 'string');
    assert.equal(object.name, 'Дом');
    assert.equal(object.status, 'waiting');
    assert.equal(object.rotation, 0);
    const id = object.id;
    app.place(3.25, 4.75);
    assert.equal(app.state().objects[0].id, id);
    assert.doesNotThrow(() => JSON.stringify(app.state()));
});

test('JSON import stages replacement, cancellation keeps current plan and confirmation resets UI', () => {
    const app=editor(); app.add(); app.place(4,5);
    assert.equal(app.run('typeof stageProjectImport'),'function','import action is available');
    const originalX=app.state().objects[0].x;
    const incoming=JSON.parse(JSON.stringify(app.state()));
    incoming.name='Другой сад'; incoming.settings={units:'m'};
    incoming.plot.width=40; incoming.plot.borders.north='road'; incoming.objects[0].x=12;
    app.run(`stageProjectImport(${JSON.stringify(JSON.stringify(incoming))})`);
    assert.equal(app.state().plot.width,20);
    app.run('cancelProjectImport()');
    assert.equal(app.state().objects[0].x,originalX);
    app.run(`stageProjectImport(${JSON.stringify(JSON.stringify(incoming))}); confirmProjectImport()`);
    assert.equal(app.state().objects[0].x,12); assert.equal(app.state().name,'Другой сад');
    assert.equal(app.get('plot-width').value,'40'); assert.equal(app.get('north-side').value,'road');
    assert.equal(app.run('selectedId'),null);
    app.get('plot-length').value='50'; app.run('createPlot()');
    assert.equal(app.state().plot.borders.north,'road');
});

test('JSON import errors preserve model and empty import clears rendered objects', () => {
    const app=editor(); app.add(); app.place(4,5);
    assert.equal(app.run('typeof stageProjectImport'),'function','safe import action is available');
    const before=JSON.stringify(app.state());
    app.run('stageProjectImport("{")');
    assert.equal(JSON.stringify(app.state()),before);
    assert.match(app.get('project-file-status').textContent,/JSON/);
    const text=app.run('YardMap.serializeProject(YardMap.createProject())');
    app.run(`stageProjectImport(${JSON.stringify(text)}); confirmProjectImport()`);
    assert.equal(app.state().plot,null);
    assert.equal(app.run('document.querySelectorAll(".building").length'),0);
    assert.equal(app.get('create-plot').textContent,'Создать участок');
});

// Characterization of the actual file adapter after the serializer/controller cycle.
test('JSON download contains the current named project as a portable file', async () => {
    const app=editor(); app.add(); app.place(4,5);
    app.get('project-name').listeners.input({target:{value:'Мой сад'}});
    app.run('exportProject()');
    assert.equal(app.downloads.length,1);
    assert.equal(app.downloads[0].filename,'yardmap-project.json');
    assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()),JSON.parse(JSON.stringify(app.state())));
});
test('JSON file adapter ignores stale reads and protects current plan on read errors', async () => {
    const app=editor(); app.add();
    const before=JSON.stringify(app.state());
    const input=app.get('import-project');
    let resolveOld;
    input.files=[{size:1,text:()=>new Promise(resolve=>{resolveOld=resolve;})}];
    const oldRead=input.listeners.change({target:input});
    input.files=[{size:1,text:()=>Promise.resolve('{')}];
    await input.listeners.change({target:input});
    resolveOld(app.run('YardMap.serializeProject(YardMap.createProject())'));
    await oldRead;
    assert.equal(app.run('pendingImport'),null);
    assert.match(input.value,/^$/); assert.equal(JSON.stringify(app.state()),before);
    input.files=[{size:1,text:()=>Promise.reject(new Error('Ошибка чтения'))}];
    await input.listeners.change({target:input});
    assert.match(app.get('project-file-status').textContent,/Ошибка чтения/);
    assert.equal(JSON.stringify(app.state()),before);
});

test('drag stores precise metre coordinates relative to the plot', () => {
    const app = editor(); app.add(); app.place(3.25, 4.75);
    const object = app.state().objects[0];
    assert.ok(Math.abs(object.x - 3.25) < 1e-9, `expected 3.25 m, got ${object.x}`);
    assert.ok(Math.abs(object.y - 4.75) < 1e-9, `expected 4.75 m, got ${object.y}`);
    assert.equal(object.status, 'placed');
});

test('changing plot size rerenders objects without changing their metre geometry', () => {
    const app = editor(); app.add(); app.place(3.25, 4.75);
    const object = app.state().objects[0];
    const oldWidth = app.run('document.querySelectorAll(".building")[0].style.width');
    const oldX = object.x, oldY = object.y;
    app.get('plot-width').value = '40'; app.get('plot-length').value = '70';
    app.run('createPlot()');
    const newWidth = app.run('document.querySelectorAll(".building")[0].style.width');
    assert.ok(Math.abs(parseFloat(newWidth) * 2 - parseFloat(oldWidth)) < 1e-9,
        `screen width must follow scale: ${oldWidth} -> ${newWidth}`);
    assert.equal(app.state().objects[0].width, 5);
    assert.equal(app.state().objects[0].length, 6);
    assert.equal(app.state().objects[0].x, oldX);
    assert.equal(app.state().objects[0].y, oldY);
});

test('multiple pending objects have separate cards outside the plot canvas', () => {
    const app = editor(); app.add(); app.add();
    const objects = app.run('document.querySelectorAll(".building")');
    assert.equal(objects.length, 2);
    assert.notEqual(objects[0].parentElement, objects[1].parentElement,
        'waiting objects need separate cards, not overlapping canvas positions');
    assert.equal(objects[0].parentElement.parentElement, app.get('waiting-area'));
    assert.equal(objects[1].parentElement.parentElement, app.get('waiting-area'));
});

test('drop entirely outside plot returns object to waiting without losing identity', () => {
    const app = editor(); app.add();
    const id = app.state().objects[0].id;
    app.place(50, 50);
    const object = app.state().objects[0];
    assert.equal(object.id, id);
    assert.equal(object.status, 'waiting');
    assert.equal(object.x, null); assert.equal(object.y, null);
});

test('waiting objects do not participate in measurements', () => {
    const app = editor(); app.add(); app.place(3.25, 4.75);
    assert.equal(app.run('document.querySelectorAll(".distance-label").length'), 4);
    app.add();
    assert.equal(app.run('document.querySelectorAll(".distance-label").length'), 0);
    const id = app.state().objects[0].id;
    app.run(`selectedId = '${id}'; render()`);
    assert.equal(app.run('document.querySelectorAll(".distance-label").length'), 4);
});

test('building dimensions are entered directly in metres including fractions', () => {
    const app = editor();
    app.get('building-width').value = '5.25'; app.get('building-length').value = '6.5';
    app.add();
    assert.equal(app.state().objects[0].width, 5.25);
    assert.equal(app.state().objects[0].length, 6.5);
});

test('invalid plot dimensions report errors at each field without mutating the project', () => {
    const app = editor(); app.add();
    const before = JSON.stringify(app.state());
    for (const bad of ['', '0', '-1', 'Infinity', 'NaN']) {
        app.get('plot-width').value = bad; app.get('plot-length').value = bad;
        app.run('createPlot()');
        assert.equal(JSON.stringify(app.state()), before);
        assert.equal(app.get('plot-width')['aria-invalid'], 'true');
        assert.equal(app.get('plot-length')['aria-invalid'], 'true');
        assert.match(app.get('plot-width-error').textContent, /больше нуля/);
        assert.match(app.get('plot-length-error').textContent, /больше нуля/);
    }
    assert.equal(app.alerts.length, 0);
    app.get('plot-width').value = '20.5'; app.get('plot-length').value = '35.75';
    app.run('createPlot()');
    assert.equal(app.get('plot-width-error').textContent, '');
    assert.equal(app.get('plot-width')['aria-invalid'], 'false');
    assert.equal(app.state().plot.width, 20.5); assert.equal(app.state().plot.length, 35.75);
});

test('invalid building dimensions leave model and legend untouched and report inline errors', () => {
    const app = editor(); app.add();
    const before = JSON.stringify(app.state());
    for (const bad of ['', '0', '-0.25', 'Infinity', 'NaN']) {
        app.get('building-width').value = bad; app.get('building-length').value = bad;
        app.add();
        assert.equal(JSON.stringify(app.state()), before);
        assert.equal(app.get('building-width')['aria-invalid'], 'true');
        assert.equal(app.get('building-length')['aria-invalid'], 'true');
        assert.match(app.get('building-width-error').textContent, /больше нуля/);
        assert.equal(app.run('document.querySelectorAll(".legend-count")[0].textContent'), '1');
    }
    assert.equal(app.alerts.length, 0);
});

test('shrinking the plot preserves objects and marks all outside objects without selection', () => {
    const app = editor(); app.add(); app.place(12, 20);
    const before = JSON.stringify(app.state().objects[0]);
    app.add(); // selected object is now waiting; warning must cover the entire plan
    app.get('plot-width').value = '10'; app.get('plot-length').value = '15';
    app.run('createPlot()');
    assert.equal(JSON.stringify(app.state().objects[0]), before);
    assert.equal(app.run('document.querySelectorAll(".outside-building").length'), 1);
    assert.match(app.get('outside-warning').textContent, /1/);
    app.get('plot-width').value = '20'; app.get('plot-length').value = '35';
    app.run('createPlot()');
    assert.equal(app.run('document.querySelectorAll(".outside-building").length'), 0);
    assert.equal(app.get('outside-warning').textContent, '');
});

test('new project has explicit confirmation and cancellation retains current objects', () => {
    const app = editor(); app.add(); app.place(3.25, 4.75);
    const before = JSON.stringify(app.state());
    assert.equal(typeof app.get('new-project').listeners.click, 'function', 'separate new-project action is required');
    app.get('new-project').listeners.click();
    assert.equal(app.get('new-project-confirmation').hidden, false);
    assert.equal(JSON.stringify(app.state()), before);
    app.get('cancel-new-project').listeners.click();
    assert.equal(app.get('new-project-confirmation').hidden, true);
    assert.equal(JSON.stringify(app.state()), before);
    app.get('new-project').listeners.click();
    app.get('plot-width').value = '25.5'; app.get('plot-length').value = '40';
    app.get('north-side').value = 'road';
    app.get('confirm-new-project').listeners.click();
    assert.equal(app.state().objects.length, 0);
    assert.equal(app.state().plot.width, 25.5);
    assert.equal(app.state().plot.borders.north, '');
    assert.equal(app.get('north-side').value, '');
    assert.equal(app.run('document.querySelectorAll(".building").length'), 0);
    assert.equal(app.get('new-project-confirmation').hidden, true);
});

test('invalid new-project dimensions cannot erase the existing project', () => {
    const app = editor(); app.add();
    const before = JSON.stringify(app.state());
    assert.equal(typeof app.get('new-project').listeners.click, 'function', 'separate new-project action is required');
    app.get('new-project').listeners.click();
    app.get('plot-width').value = '';
    app.get('confirm-new-project').listeners.click();
    assert.equal(JSON.stringify(app.state()), before);
    assert.equal(app.get('new-project-confirmation').hidden, false);
    assert.equal(app.get('plot-width')['aria-invalid'], 'true');
});

test('container resize rerenders screen geometry without changing the project or measurements', () => {
    const app = editor(); app.add(); app.place(3.25, 4.75);
    const before = JSON.stringify(app.state());
    const oldWidth = app.run('document.querySelectorAll(".building")[0].style.width');
    const labels = app.run('document.querySelectorAll(".distance-label").map(el => el.textContent).join("|")');
    app.get('container').clientWidth = 300;
    app.run('render()');
    assert.equal(JSON.stringify(app.state()), before);
    assert.notEqual(app.run('document.querySelectorAll(".building")[0].style.width'), oldWidth);
    assert.equal(app.run('document.querySelectorAll(".distance-label").map(el => el.textContent).join("|")'), labels);
});

test('placement report rejects parking overlap even with zero required gap and no selected object', () => {
    const app = editor(); app.add(); app.place(3, 4);
    app.get('building-type').value = 'parking';
    app.get('building-width').value = '2'; app.get('building-length').value = '2'; app.add();
    app.run('YardMap.placeObject(project, project.objects[1].id, 4, 5); selectedId = null; render()');
    assert.equal(app.run('document.querySelectorAll(".placement-issue").filter(el => el.dataset.kind === "overlap").length'), 1);
    assert.equal(app.run('document.querySelectorAll(".invalid-building").length'), 2);
    app.run('selectedId = project.objects[0].id; render()');
    assert.equal(app.run('document.querySelectorAll(".pair-measurement")[0].dataset.status'), 'overlap');
});

test('placement report distinguishes allowed parking contact from overlap and insufficient gaps', () => {
    const app = editor(); app.add(); app.place(3, 4);
    app.get('building-type').value = 'parking';
    app.get('building-width').value = '2'; app.get('building-length').value = '2'; app.add();
    app.run('YardMap.placeObject(project, project.objects[1].id, 8, 4); selectedId = null; render()');
    assert.match(app.get('placement-summary').textContent, /Касаний: 1/);
    assert.equal(app.run('document.querySelectorAll(".placement-issue").length'), 0);
    assert.equal(app.run('document.querySelectorAll(".invalid-building").length'), 0);
    app.run('project.objects[1].type = "house"; render()');
    assert.equal(app.run('document.querySelectorAll(".placement-issue").filter(el => el.dataset.kind === "object-gap").length'), 1);
});

test('placement report checks all placed objects and excludes waiting objects', () => {
    const app = editor(); app.add(); app.place(3, 4);
    app.add();
    app.run('YardMap.placeObject(project, project.objects[1].id, 9, 4); selectedId = null; render()');
    app.add(); // waiting object is now selected
    assert.equal(app.run('document.querySelectorAll(".placement-issue").filter(el => el.dataset.kind === "object-gap").length'), 1);
    assert.equal(app.get('placement-summary').dataset.checkedObjects, '2');
    app.run('YardMap.placeObject(project, project.objects[1].id, 12, 4); render()');
    assert.equal(app.run('document.querySelectorAll(".placement-issue").length'), 0);
});

test('placement report detects exits at every plot side independently of selection', () => {
    const app = editor(); app.add();
    for (const point of [{x:-0.1,y:4}, {x:3,y:-0.1}, {x:15.1,y:4}, {x:3,y:29.1}]) {
        app.run(`YardMap.placeObject(project, project.objects[0].id, ${point.x}, ${point.y}); selectedId = null; render()`);
        assert.equal(app.run('document.querySelectorAll(".placement-issue").filter(el => el.dataset.kind === "outside").length'), 1);
    }
});

test('pair measurement connects closest rectangle points for a diagonal gap', () => {
    const app = editor(); app.add(); app.place(3, 4); app.add();
    app.run('YardMap.placeObject(project, project.objects[1].id, 11, 14); selectedId = project.objects[0].id; render()');
    const line = app.run('document.querySelectorAll(".distance-line").filter(el => !el.classList.contains("distance-label")).at(-1)');
    const scale = app.run('view.scale');
    assert.ok(Math.abs(parseFloat(line.style.width) - 5 * scale) < 1e-9,
        'diagonal 3-4-5 gap must measure 5 m, not the distance between centres');
    assert.ok(Math.abs(parseFloat(line.style.left) - app.run('view.left + 8 * view.scale')) < 1e-9);
    assert.ok(Math.abs(parseFloat(line.style.top) - app.run('view.top + 10 * view.scale')) < 1e-9);
});

test('distance labels explicitly describe preliminary thresholds rather than verified legal minima', () => {
    const app = editor(); app.add(); app.place(3, 4);
    const labels = app.run('document.querySelectorAll(".distance-label").map(el => el.textContent).join("|")');
    assert.match(labels, /задано/);
    assert.doesNotMatch(labels, /мин\./);
});

test('near-threshold labels do not round an insufficient offset up to its threshold', () => {
    const app = editor(); app.add(); app.place(2.99999, 4);
    assert.match(app.run('document.querySelectorAll(".distance-label")[0].textContent'), /^2\.99999 /);
    app.place(-0.00001, 4);
    assert.match(app.run('document.querySelectorAll(".distance-label")[0].textContent'), /^-0\.00001 /);
});
