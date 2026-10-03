(() => {
    const api = globalThis.YardMap;
    function distanceText(actual, required) {
        const value = Math.abs(actual) <= api.geometryEpsilon ? 0 : actual;
        let precision = 3;
        while (precision < 9 && ((value < 0 && Number(value.toFixed(precision)) === 0)
            || (value < required && Number(value.toFixed(precision)) >= required))) {
            precision++;
        }
        return value.toFixed(precision);
    }
    class Renderer {
        constructor(container, waitingArea, onDrag, onHighlight, onSelect) {
            this.container = container;
            this.waitingArea = waitingArea;
            this.plot = document.getElementById('plot');
            this.elements = new Map();
            this.onDrag = onDrag;
            this.onHighlight = onHighlight;
            this.onSelect = onSelect;
        }
        render(project, selectedId, highlightedType, viewState = api.createViewportState()) {
            const analysis = api.analyzePlacement(project);
            this.renderAreas(project);
            this.renderPlacementReport(project, analysis);
            this.plot.hidden = !project.plot;
            if (!project.plot) {
                this.elements.forEach(element => element.remove()); this.elements.clear();
                this.waitingArea.replaceChildren();
                document.querySelectorAll('.distance-line').forEach(element => element.remove());
                document.querySelectorAll('.plot-border').forEach(element => element.remove());
                document.querySelectorAll('.restriction-line').forEach(element=>element.remove());
                document.getElementById('outside-warning').textContent = '';
                this.renderLegend(project,highlightedType); return null;
            }
            const view = api.viewForPlot(project.plot, this.container.clientWidth, this.container.clientHeight, viewState);
            const gridPixels = viewState.step * view.scale;
            this.plot.style.backgroundImage = viewState.gridVisible && gridPixels >= 4
                ? 'linear-gradient(to right, #90a4ae66 1px, transparent 1px), linear-gradient(to bottom, #90a4ae66 1px, transparent 1px)' : 'none';
            this.plot.style.backgroundSize = `${gridPixels}px ${gridPixels}px`;
            Object.assign(this.plot.style, {
                width: project.plot.width * view.scale + 'px', height: project.plot.length * view.scale + 'px',
                left: view.left + 'px', top: view.top + 'px'
            });
            this.renderBorders(project.plot, view);
            this.renderConstraints(project, view);
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
                    element.addEventListener('pointerdown', this.onDrag);
                    element.addEventListener('click',()=>this.onSelect(object.id));
                    element.addEventListener('focus',()=>this.onSelect(object.id));
                    element.addEventListener('keydown',event=>{
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.onSelect(object.id); }
                    });
                    element.setAttribute('role','button'); element.tabIndex=0;
                    const label = document.createElement('span'); label.className='building-name'; element.appendChild(label);
                    this.elements.set(object.id, element);
                }
                const definition = api.definitions[object.type];
                const size = api.objectSize(object);
                const waiting = object.status === 'waiting';
                const outside = !waiting && object.assessment?.ownership!=='neighbor' && !api.isInsidePlot(project.plot, object);
                if (outside) outsideObjects.push(object);
                element.className = 'building' + (waiting ? ' waiting-building' : '')
                    + (outside ? ' outside-building' : '')
                    + (analysis.invalidObjectIds.has(object.id) ? ' invalid-building' : '')
                    + (object.id === selectedId ? ' selected-building' : '');
                if (object.locked) element.className += ' locked-building';
                if(object.assessment?.ownership==='neighbor')element.className+=' neighbor-building';
                if(this.focusedCheck?.objectIds.includes(object.id))element.className+=' focused-building';
                element.children[0].textContent = object.name;
                element.setAttribute('aria-pressed',String(object.id === selectedId));
                element.dataset.type = object.type;
                if(object.geometry?.kind==='circle')element.className+=' circle-object';
                if(object.geometry?.kind==='line')element.className+=' line-object';
                if(!definition.solid)element.className+=' overlay-object';
                element.title = object.geometry?.kind==='circle'?`${object.name}: крона диаметром ${object.width} м; координаты ствола`:object.geometry?.kind==='line'?`${object.name}: линия ${Math.hypot(object.geometry.dx,object.geometry.dy).toFixed(2)} м`:`${object.name} ${object.width} × ${object.length} м`;
                if (outside) element.title += ' — За границами участка';
                if (object.locked) element.title += ' — Положение закреплено';
                element.setAttribute('aria-label', element.title);
                element.style.backgroundColor = definition.color;
                element.style.borderColor = definition.color.replace('0.7', '1');
                element.style.boxShadow = highlightedType === object.type ? `0 0 0 2px ${definition.color.replace('0.7', '1')}` : '';
                const scale = waiting ? Math.min(view.scale, 12, 160 / Math.max(size.width, size.length)) : view.scale;
                element.dataset.renderScale=String(scale);
                element.style.width = Math.max(object.geometry?.kind==='line'?12:0,size.width * scale) + 'px';
                element.style.height = Math.max(object.geometry?.kind==='line'?12:0,size.length * scale) + 'px';
                while(element.children.length>1)element.children[1].remove();
                if(object.geometry?.kind==='circle') {
                    const trunk=document.createElement('span');trunk.className='tree-trunk';trunk.setAttribute('aria-hidden','true');element.appendChild(trunk);
                }
                if(object.geometry?.kind==='line') {
                    const points=api.linePoints({...object,x:0,y:0}),bounds=api.objectRect({...object,x:0,y:0});
                    const line=document.createElement('span');line.className='object-line';line.setAttribute('aria-hidden','true');
                    Object.assign(line.style,{left:(points[0].x-bounds.left)*scale+'px',top:(points[0].y-bounds.top)*scale+'px',width:Math.hypot(object.geometry.dx,object.geometry.dy)*scale+'px',backgroundColor:definition.color.replace('0.7','1'),transform:`rotate(${Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)}rad)`});element.appendChild(line);
                }
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
                    const bounds=api.objectRect(object);
                    const position = api.toScreen({x:bounds.left,y:bounds.top}, view);
                    element.style.left = position.x + 'px';
                    element.style.top = position.y + 'px';
                    if (element.parentElement !== this.container) this.container.appendChild(element);
                }
                element.style.zIndex = object.id === selectedId ? '100' : '10';
            }
            document.getElementById('outside-warning').textContent = outsideObjects.length
                ? `За границами участка: ${outsideObjects.length} (${outsideObjects.map(object => object.name).join(', ')}). Объекты сохранены. Увеличьте участок или переместите их.` : '';
            this.renderLegend(project,highlightedType);
            this.renderMeasurements(project, selectedId, view, analysis);
            return view;
        }
        renderAreas(project) {
            const summary=api.areaSummary(project),text=document.getElementById('area-summary');
            text.textContent=project.plot?`Участок: ${summary.plot.toFixed(2)} м² (${summary.sotkas.toFixed(2)} соток). Покрытие внутри участка: ≈${summary.covered.toFixed(2)} м² (${summary.percent.toFixed(2)}%).`:'Создайте участок для расчёта площади.';
            const list=document.getElementById('area-categories');list.replaceChildren();
            for(const [category,value] of Object.entries(summary.categories)){const item=document.createElement('li');item.textContent=`${api.categoryLabels[category]}: ≈${value.toFixed(2)} м²`;list.appendChild(item);}
            this.areas=summary;
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
                if({left:'west',right:'east',top:'north',bottom:'south'}[this.focusedCheck?.side]===side)border.className+=' focused-border';
                border.textContent = api.borderLabels[type];
                this.container.appendChild(border);
            }
        }
        renderConstraints(project,view) {
            document.querySelectorAll('.restriction-line').forEach(el=>el.remove());
            for(const c of project.assessment.constraints) {
                const a=api.toScreen({x:c.x1,y:c.y1},view),b=api.toScreen({x:c.x2,y:c.y2},view);
                const line=document.createElement('div');line.className='restriction-line';line.title=c.name;
                if(this.focusedCheck?.lineId===c.id)line.className+=' focused-constraint';
                Object.assign(line.style,{left:a.x+'px',top:a.y+'px',width:Math.hypot(b.x-a.x,b.y-a.y)+'px',transform:`rotate(${Math.atan2(b.y-a.y,b.x-a.x)}rad)`});
                this.container.appendChild(line);
            }
        }
        renderLegend(project,highlightedType) {
            const legend = document.getElementById('legend-content');
            legend.replaceChildren();
            let lastCategory=null;
            for (const [type, definition] of Object.entries(api.definitions).sort(([,a],[,b])=>Object.keys(api.categoryLabels).indexOf(a.category)-Object.keys(api.categoryLabels).indexOf(b.category))) {
                if(lastCategory!==definition.category){const heading=document.createElement('h3');heading.className='legend-category';heading.textContent=api.categoryLabels[definition.category];legend.appendChild(heading);lastCategory=definition.category;}
                const item = document.createElement('button');
                item.type = 'button';
                item.setAttribute('aria-pressed',String(type===highlightedType));
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
        renderPlacementReport(project, analysis) {
            document.getElementById('placement-report').hidden = !project.plot;
            const summary = document.getElementById('placement-summary');
            summary.dataset.checkedObjects = String(analysis.checkedObjects);
            const count = kind => analysis.issues.filter(issue => issue.kind === kind).length;
            summary.textContent = `Размещено: ${analysis.checkedObjects}. Пересечений: ${count('overlap')}. Выходов за участок: ${count('outside')}. Недостаточных отступов: ${count('border-gap') + count('object-gap')}. Касаний: ${analysis.contacts}.`;
            const list = document.getElementById('placement-issues');
            list.replaceChildren();
            const sideNames = { left: 'западной', right: 'восточной', top: 'северной', bottom: 'южной' };
            for (const issue of analysis.issues) {
                const names = issue.objectIds.map(id => project.objects.find(object => object.id === id).name);
                if(issue.ruleId)continue;
                const item = document.createElement('li');
                item.className = 'placement-issue';
                item.dataset.kind = issue.kind;
                if (issue.kind === 'outside') {
                    item.textContent = `${names[0]} выходит за границы участка (${issue.sides.map(side => sideNames[side]).join(', ')}).`;
                } else if (issue.kind === 'overlap') {
                    item.textContent = `${names.join(' ↔ ')}: контуры пересекаются. Нулевой отступ не разрешает перекрытие.`;
                } else if (issue.kind === 'object-gap') {
                    item.textContent = `${names.join(' ↔ ')}: ${distanceText(issue.actual, issue.required)} м между контурами; задано ${issue.required} м.`;
                } else {
                    item.textContent = `${names[0]}: ${distanceText(issue.actual, issue.required)} м до ${sideNames[issue.side]} границы; задано ${issue.required} м.`;
                }
                const button=document.createElement('button');button.type='button';button.textContent=item.textContent;item.textContent='';
                button.addEventListener('click',()=>globalThis.focusPlacementCheck({...issue,title:'Геометрия размещения',missing:[]}));item.appendChild(button);
                list.appendChild(item);
            }
            const labels={pass:'Расстояние выдержано по пункту',violation:'Меньше значения пункта',insufficient_data:'Недостаточно данных',source_pending:'Источник не проверен полностью',not_applicable:'Не применяется'};
            const countStatus=s=>analysis.checks.filter(c=>c.status===s).length;
            summary.textContent+=` По правилам: отклонений ${countStatus('violation')}, неполных проверок ${countStatus('insufficient_data')+countStatus('source_pending')}. Это не заключение о законности или безопасности участка.`;
            const filter=document.getElementById('rule-filter').value||'warnings';
            for(const c of analysis.checks) {
                if(filter==='warnings'&&['pass','not_applicable'].includes(c.status))continue;
                if(filter==='violations'&&c.status!=='violation')continue;
                const item=document.createElement('li');item.className='rule-result'+(c.status==='violation'?' placement-issue':'');
                item.dataset.ruleId=c.ruleId;item.dataset.status=c.status;item.dataset.kind=c.side?'border-gap':'object-gap';
                const button=document.createElement('button');button.type='button';
                const names=c.objectIds.map(id=>project.objects.find(o=>o.id===id)?.name).join(' ↔ ');
                const metric=c.metric==='condition'?'Условие соединения/стока':c.actual===null?'Расстояние не определено':`${distanceText(c.actual,c.required??0)} м${c.required===null?'':`; минимум ${c.required} м`}`;
                button.textContent=`${names}${c.side?' — '+sideNames[c.side]+' стороны':''}: ${c.title}. ${labels[c.status]}. ${metric}.`;
                button.addEventListener('click',()=>globalThis.focusPlacementCheck(c));
                item.appendChild(button);
                const explanation=document.createElement('p');
                explanation.textContent=`${c.category==='user'?'Пользовательское ограничение':c.category==='geometry'?'Геометрия соединения':'Требование документа'}. ${c.reason||''}${c.missing.length?' Нужно указать: '+c.missing.join(', ')+'.':''}`;
                item.appendChild(explanation);
                if(c.source) {
                    const link=document.createElement('a');link.href=c.source.url;link.target='_blank';link.rel='noopener';
                    link.textContent=`${c.source.document}, п. ${c.clause}; редакция ${c.source.revision||"не сверена"}; проверено ${c.source.checkedAt}`;item.appendChild(link);
                    if(c.source.amendmentUrl){const amendment=document.createElement('a');amendment.href=c.source.amendmentUrl;amendment.target='_blank';amendment.rel='noopener';amendment.textContent=' Изменение №1';item.appendChild(amendment);}
                }
                list.appendChild(item);
            }
        }
        renderMeasurements(project, selectedId, view, analysis) {
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
                this.distanceLine(points[0], points[1], distances[side], null, view);
            }
            const current=analysis.checks.find(c=>this.focusedCheck&&c.ruleId===this.focusedCheck.ruleId&&c.side===this.focusedCheck.side&&c.lineId===this.focusedCheck.lineId&&c.windowIndex===this.focusedCheck.windowIndex&&c.objectIds.join('|')===this.focusedCheck.objectIds.join('|'));
            if(current?.start&&current.end)this.distanceLine(current.start,current.end,current.actual,current.required,view,{pair:true,status:current.status});
            for (const pair of analysis.pairs) {
                if (!pair.objectIds.includes(object.id)) continue;
                const reversed = pair.objectIds[1] === object.id;
                this.distanceLine(reversed ? pair.end : pair.start, reversed ? pair.start : pair.end,
                    pair.distance, pair.required, view, { pair: true, status: pair.relation });
            }
        }
        distanceLine(start, end, actual, required, view, options = {}) {
            const a = api.toScreen(start, view), b = api.toScreen(end, view);
            const ok = options.status !== 'overlap' && (required===null || actual >= required);
            const color=options.status==='overlap'?'#f44336':required===null?'#546e7a':ok?'#4caf50':'#f44336';
            const line = document.createElement('div');
            line.className = 'distance-line' + (options.pair ? ' pair-measurement' : '');
            if (options.status) line.dataset.status = options.status;
            Object.assign(line.style, {
                left: a.x + 'px', top: a.y + 'px', width: Math.hypot(b.x - a.x, b.y - a.y) + 'px',
                height: '2px', backgroundColor: color, transformOrigin: '0 0',
                transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`
            });
            this.container.appendChild(line);
            const label = document.createElement('div');
            label.className = 'distance-line distance-label';
            label.textContent = options.status === 'allowed-overlay'?'Наложение зон / кроны (разрешено геометрией)':options.status === 'overlap' ? 'Пересечение контуров'
                : `${distanceText(actual, required??0)} м${required===null?' — геометрическое измерение':` (минимум по выбранному правилу ${required} м)`}${options.status === 'touching' ? ' — касание' : ''}`;
            Object.assign(label.style, {
                left: (a.x + b.x) / 2 + 'px', top: (a.y + b.y) / 2 + 'px',
                borderColor: color
            });
            this.container.appendChild(label);
        }
    }
    api.Renderer = Renderer;
})();
