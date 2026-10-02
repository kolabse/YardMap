(() => {
    const api = globalThis.YardMap;
    class Renderer {
        constructor(container, waitingArea, onDrag, onHighlight) {
            this.container = container;
            this.waitingArea = waitingArea;
            this.plot = document.getElementById('plot');
            this.elements = new Map();
            this.onDrag = onDrag;
            this.onHighlight = onHighlight;
        }
        render(project, selectedId, highlightedType) {
            if (!project.plot) { this.renderLegend(project); return null; }
            const view = api.createView(project.plot, this.container.clientWidth, this.container.clientHeight);
            Object.assign(this.plot.style, {
                width: project.plot.width * view.scale + 'px', height: project.plot.length * view.scale + 'px',
                left: view.left + 'px', top: view.top + 'px'
            });
            this.renderBorders(project.plot, view);
            this.waitingArea.replaceChildren();
            const liveIds = new Set(project.objects.map(object => object.id));
            const outsideObjects = [];
            for (const [id, element] of this.elements) {
                if (!liveIds.has(id)) { element.remove(); this.elements.delete(id); }
            }
            for (const object of project.objects) {
                let element = this.elements.get(object.id);
                if (!element) {
                    element = document.createElement('div');
                    element.dataset.id = object.id;
                    element.addEventListener('mousedown', this.onDrag);
                    this.elements.set(object.id, element);
                }
                const definition = api.definitions[object.type];
                const size = api.objectSize(object);
                const waiting = object.status === 'waiting';
                const outside = !waiting && !api.isInsidePlot(project.plot, object);
                if (outside) outsideObjects.push(object);
                element.className = 'building' + (waiting ? ' waiting-building' : '')
                    + (outside ? ' outside-building' : '')
                    + (object.id === selectedId ? ' selected-building' : '');
                element.dataset.type = object.type;
                element.title = `${object.name} ${object.width} × ${object.length} м`;
                if (outside) element.title += ' — За границами участка';
                element.setAttribute('aria-label', element.title);
                element.style.backgroundColor = definition.color;
                element.style.borderColor = definition.color.replace('0.7', '1');
                element.style.boxShadow = highlightedType === object.type ? `0 0 0 2px ${definition.color.replace('0.7', '1')}` : '';
                const scale = waiting ? Math.min(view.scale, 12, 160 / Math.max(size.width, size.length)) : view.scale;
                element.style.width = size.width * scale + 'px';
                element.style.height = size.length * scale + 'px';
                if (waiting) {
                    const card = document.createElement('div');
                    card.className = 'waiting-card';
                    const caption = document.createElement('div');
                    caption.className = 'waiting-caption';
                    caption.textContent = element.title;
                    element.style.left = ''; element.style.top = '';
                    card.append(element, caption);
                    this.waitingArea.appendChild(card);
                } else {
                    const position = api.toScreen(object, view);
                    element.style.left = position.x + 'px';
                    element.style.top = position.y + 'px';
                    this.container.appendChild(element);
                }
                element.style.zIndex = object.id === selectedId ? '100' : '10';
            }
            document.getElementById('outside-warning').textContent = outsideObjects.length
                ? `За границами участка: ${outsideObjects.length} (${outsideObjects.map(object => object.name).join(', ')}). Объекты сохранены. Увеличьте участок или переместите их.` : '';
            this.renderLegend(project);
            this.renderMeasurements(project, selectedId, view);
            return view;
        }
        renderBorders(plot, view) {
            document.querySelectorAll('.plot-border').forEach(element => element.remove());
            this.container.style.setProperty('--plot-left', view.left + 'px');
            this.container.style.setProperty('--plot-top', view.top + 'px');
            this.container.style.setProperty('--plot-width', plot.width * view.scale + 'px');
            this.container.style.setProperty('--plot-height', plot.length * view.scale + 'px');
            for (const [side, type] of Object.entries(plot.borders)) {
                if (!type) continue;
                const border = document.createElement('div');
                border.className = `plot-border ${side}-border border-${type}`;
                border.textContent = api.borderLabels[type];
                this.container.appendChild(border);
            }
        }
        renderLegend(project) {
            const legend = document.getElementById('legend-content');
            legend.replaceChildren();
            for (const [type, definition] of Object.entries(api.definitions)) {
                const item = document.createElement('div');
                item.className = 'legend-item'; item.dataset.type = type;
                const swatch = document.createElement('div');
                swatch.className = 'legend-color'; swatch.style.backgroundColor = definition.color;
                const name = document.createElement('div');
                name.className = 'legend-name'; name.textContent = definition.name;
                const count = document.createElement('div');
                count.className = 'legend-count';
                count.textContent = String(project.objects.filter(object => object.type === type).length);
                item.append(swatch, name, count);
                item.addEventListener('click', () => this.onHighlight(type));
                legend.appendChild(item);
            }
        }
        renderMeasurements(project, selectedId, view) {
            document.querySelectorAll('.distance-line').forEach(element => element.remove());
            const object = project.objects.find(item => item.id === selectedId);
            if (!object || object.status !== 'placed') return;
            const rect = api.objectRect(object);
            const centre = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
            const distances = api.borderDistances(project.plot, object);
            const segments = {
                left: [{ x: 0, y: centre.y }, { x: rect.left, y: centre.y }],
                right: [{ x: rect.right, y: centre.y }, { x: project.plot.width, y: centre.y }],
                top: [{ x: centre.x, y: 0 }, { x: centre.x, y: rect.top }],
                bottom: [{ x: centre.x, y: rect.bottom }, { x: centre.x, y: project.plot.length }]
            };
            for (const [side, points] of Object.entries(segments)) {
                this.distanceLine(points[0], points[1], distances[side], api.requiredBorderDistance(object.type), view);
            }
            for (const other of project.objects) {
                if (other.id === object.id || other.status !== 'placed') continue;
                const otherRect = api.objectRect(other);
                this.distanceLine(centre, {
                    x: (otherRect.left + otherRect.right) / 2, y: (otherRect.top + otherRect.bottom) / 2
                }, api.rectangleDistance(rect, otherRect), api.requiredObjectDistance(object.type, other.type), view);
            }
        }
        distanceLine(start, end, actual, required, view) {
            const a = api.toScreen(start, view), b = api.toScreen(end, view);
            const ok = actual >= required;
            const line = document.createElement('div');
            line.className = 'distance-line';
            Object.assign(line.style, {
                left: a.x + 'px', top: a.y + 'px', width: Math.hypot(b.x - a.x, b.y - a.y) + 'px',
                height: '2px', backgroundColor: ok ? '#4caf50' : '#f44336', transformOrigin: '0 0',
                transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`
            });
            this.container.appendChild(line);
            const label = document.createElement('div');
            label.className = 'distance-line distance-label';
            label.textContent = `${actual.toFixed(1)} м (мин. ${required} м)`;
            Object.assign(label.style, {
                left: (a.x + b.x) / 2 + 'px', top: (a.y + b.y) / 2 + 'px',
                borderColor: ok ? '#4caf50' : '#f44336'
            });
            this.container.appendChild(label);
        }
    }
    api.Renderer = Renderer;
})();
