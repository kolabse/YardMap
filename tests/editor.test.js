const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Small DOM boundary; geometry assertions below use real project behaviour,
// not CSS layout. Actual layout and dragging are also checked in the browser.
function editor() {
    const ids = new Map();
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag;
            this.style = { setProperty() {} };
            this.dataset = {};
            this.children = [];
            this.className = '';
            this.value = '';
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
        getElementById: get,
        querySelector: () => container,
        querySelectorAll: selector => selector.startsWith('#')
            ? selector.split(',').map(s => get(s.trim().slice(1)))
            : all().filter(el => el.classList.contains(selector.slice(1))),
        createElement: tag => new Element(tag),
        addEventListener() {}, removeEventListener() {}
    };
    const context = vm.createContext({ document, console, alert() {}, window: { addEventListener() {} } });
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const [, src] of html.matchAll(/<script\s+src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
    }
    const run = code => vm.runInContext(code, context);
    get('plot-width').value = '20'; get('plot-length').value = '35';
    get('building-type').value = 'house';
    get('building-width').value = '500'; get('building-length').value = '600';
    run('createPlot()');
    return {
        get, run,
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
