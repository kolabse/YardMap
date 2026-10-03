// These controls edit the same model/history/storage as geometry controls.
function assessmentField(id) { return document.getElementById(id); }
function optionalAssessmentNumber(id) { const v=assessmentField(id).value;return v.trim()===''?null:Number(v); }
const assessmentObjectFields=['ownership','purpose','standalone','measurement','height','drainage','attached-to',
    'projection-left','projection-right','projection-top','projection-bottom','windows-known'];
let assessmentPanelDirty=false,assessmentProjectIdentity=null;
for(const field of assessmentObjectFields)for(const event of ['input','change'])assessmentField('object-'+field).addEventListener(event,()=>objectPanelDirty=true);
for(const id of ['assessment-territory','assessment-sewer','assessment-local-road',...['north','east','south','west'].map(s=>'assessment-lanes-'+s)])
    for(const event of ['input','change'])assessmentField(id).addEventListener(event,()=>assessmentPanelDirty=true);
assessmentField('apply-assessment').addEventListener('click',applyAssessmentSettings);
assessmentField('add-constraint').addEventListener('click',addAssessmentConstraint);
assessmentField('add-window').addEventListener('click',()=>editSelectedObject(o=>{
    const x=assessmentField('window-x').value,y=assessmentField('window-y').value;
    if(!x.trim()||!y.trim())throw new Error('Укажите X и Y окна.');
    const a=readObjectAssessment();a.windows=[...(a.windows??[]),{x:Number(x),y:Number(y)}];
    YardMap.updateObject(project,o.id,{assessment:a});
}));
assessmentField('rule-filter').addEventListener('change',render);
function readObjectAssessment() {
    const a=YardMap.objectAssessment(selectedObject()?.assessment);
    for(const key of ['ownership','purpose','standalone','measurement','drainage'])a[key]=assessmentField('object-'+key).value;
    a.height=optionalAssessmentNumber('object-height');
    a.projections=Object.fromEntries(['left','right','top','bottom'].map(s=>[s,optionalAssessmentNumber('object-projection-'+s)]));
    a.attachedTo=assessmentField('object-attached-to').value||null;
    a.windows=assessmentField('object-windows-known').checked?(a.windows??[]):null;
    return YardMap.objectAssessment(a);
}
function applyAssessmentSettings() {
    cancelDrag();stopPan();
    try {
        project.assessment=YardMap.projectAssessment({...project.assessment,
            territory:assessmentField('assessment-territory').value,sewer:assessmentField('assessment-sewer').value,
            localRoadMinimum:optionalAssessmentNumber('assessment-local-road'),
            lanes:Object.fromEntries(['north','east','south','west'].map(s=>[s,assessmentField('assessment-lanes-'+s).value]))});
        assessmentPanelDirty=false;assessmentField('assessment-error').textContent='';render();saveCommittedProject();
    }catch(e){assessmentField('assessment-error').textContent=e.message;}
}
function addAssessmentConstraint() {
    if(!project.plot){assessmentField('constraint-error').textContent='Сначала создайте участок.';return;}
    cancelDrag();stopPan();
    try {
        const lines=project.assessment.constraints;
        let number=1;while(lines.some(l=>l.id==='line-'+number))number++;
        const line={id:'line-'+number,kind:assessmentField('constraint-kind').value,name:assessmentField('constraint-name').value};
        for(const k of ['x1','y1','x2','y2','minimum']) {
            if(!assessmentField('constraint-'+k).value.trim())throw new Error('Укажите все координаты и отступ линии.');
            line[k]=Number(assessmentField('constraint-'+k).value);
        }
        project.assessment=YardMap.projectAssessment({...project.assessment,constraints:[...lines,line]});
        assessmentField('constraint-error').textContent='';render();saveCommittedProject();
    }catch(e){assessmentField('constraint-error').textContent=e.message;}
}
function renderAssessmentControls() {
    if(assessmentProjectIdentity!==project){assessmentPanelDirty=false;assessmentProjectIdentity=project;renderer.focusedCheck=null;}
    const c=project.assessment;
    if(!assessmentPanelDirty) {
        assessmentField('assessment-territory').value=c.territory;assessmentField('assessment-sewer').value=c.sewer;
        assessmentField('assessment-local-road').value=c.localRoadMinimum===null?'':String(c.localRoadMinimum);
        for(const s of ['north','east','south','west'])assessmentField('assessment-lanes-'+s).value=c.lanes[s];
    }
    const list=assessmentField('constraint-list');list.replaceChildren();
    for(const line of c.constraints) {
        const li=document.createElement('li'),button=document.createElement('button');button.type='button';
        li.textContent=`${line.name}: (${line.x1}; ${line.y1}) → (${line.x2}; ${line.y2}), мой отступ ${line.minimum} м. `;
        button.textContent='Удалить линию';button.addEventListener('click',()=>{
            cancelDrag();stopPan();project.assessment.constraints=project.assessment.constraints.filter(l=>l.id!==line.id);render();saveCommittedProject();
        });li.appendChild(button);list.appendChild(li);
    }
    const o=selectedObject();if(!o)return;
    if(!objectPanelDirty) {
        const a=o.assessment;
        for(const k of ['ownership','purpose','standalone','measurement','drainage'])assessmentField('object-'+k).value=a[k];
        assessmentField('object-height').value=a.height===null?'':String(a.height);
        for(const s of ['left','right','top','bottom'])assessmentField('object-projection-'+s).value=a.projections[s]===null?'':String(a.projections[s]);
        const select=assessmentField('object-attached-to');select.replaceChildren();
        const none=document.createElement('option');none.value='';none.textContent='Связь не задана';select.appendChild(none);
        for(const other of project.objects)if(other.id!==o.id){const option=document.createElement('option');option.value=other.id;option.textContent=other.name;select.appendChild(option);}
        select.value=a.attachedTo||'';
        assessmentField('object-windows-known').checked=a.windows!==null;
    }
    const windows=assessmentField('window-list');windows.replaceChildren();
    for(const [index,w] of (o.assessment.windows??[]).entries()) {
        const li=document.createElement('li'),button=document.createElement('button');button.type='button';li.textContent=`Окно ${index+1}: ${w.x}; ${w.y} м. `;
        button.textContent='Удалить окно';button.addEventListener('click',()=>editSelectedObject(current=>
            YardMap.updateObject(project,current.id,{assessment:{...current.assessment,windows:current.assessment.windows.filter((_,i)=>i!==index)}})));
        li.appendChild(button);windows.appendChild(li);
    }
}
function focusPlacementCheck(c) {
    cancelDrag();stopPan();objectPanelDirty=false;objectPanelId=null;renderer.focusedCheck=c;
    selectedId=c.objectIds[0]??null;assessmentField('object-panel').open=true;
    const objects=project.objects.filter(o=>c.objectIds.includes(o.id)&&o.status==='placed');
    const points=objects.flatMap(o=>{const r=YardMap.objectRect(o);return [{x:r.left,y:r.top},{x:r.right,y:r.bottom}];});
    const line=project.assessment.constraints.find(l=>l.id===c.lineId);
    if(line)points.push({x:line.x1,y:line.y1},{x:line.x2,y:line.y2});
    if(c.side&&objects[0]){
        const r=YardMap.objectRect(objects[0]),centre={x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};
        points.push({...centre,...(c.side==='left'?{x:0}:c.side==='right'?{x:project.plot.width}:c.side==='top'?{y:0}:{y:project.plot.length})});
    }
    if(points.length&&project.plot) {
        const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
        const top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
        viewState.panX=0;viewState.panY=0;
        const base=YardMap.createView(project.plot,plotContainer.clientWidth,plotContainer.clientHeight);
        viewState.zoom=Math.max(.25,Math.min(8,Math.min((plotContainer.clientWidth-80)/Math.max(1,right-left),(plotContainer.clientHeight-80)/Math.max(1,bottom-top))/base.scale));
        const next=YardMap.viewForPlot(project.plot,plotContainer.clientWidth,plotContainer.clientHeight,viewState);
        const centre=YardMap.toScreen({x:(left+right)/2,y:(top+bottom)/2},next);
        viewState.panX+=plotContainer.clientWidth/2-centre.x;viewState.panY+=plotContainer.clientHeight/2-centre.y;
    }
    render();plotContainer.scrollIntoView?.({block:'center'});
    assessmentField('interaction-status').textContent=`Выбрана проверка: ${c.title}. ${c.missing.join(', ')}`;
}
renderAssessmentControls();render();
