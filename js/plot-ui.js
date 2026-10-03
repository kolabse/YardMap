// Coordinates are in metres. Metadata belongs to the outgoing edge of each vertex.
let plotDraftIdentity=null, plotDraftSource=null, plotDraftVertices=[], plotDraftRows=[], plotDraftCounter=1;
function resetPlotContour() {
    plotDraftIdentity=project;plotDraftSource=JSON.stringify(project.plot);
    if(project.plot?.kind==='polygon') {
        plotDraftVertices=JSON.parse(JSON.stringify(project.plot.vertices));plotDraftCounter=project.plot.nextVertexId;
    } else {
        const width=project.plot?.width||20,length=project.plot?.length||35;
        plotDraftVertices=[[0,0],[width,0],[width,length],[0,length]].map(([x,y],i)=>({id:'vertex-'+(i+1),x,y,border:project.plot?.borders[['north','east','south','west'][i]]||'',lanes:project.assessment.lanes[['north','east','south','west'][i]],minimum:null}));plotDraftCounter=5;
    }
    document.getElementById('plot-contour-error').textContent='';drawPlotDraft();
}
function readPlotDraft() {
    plotDraftVertices=plotDraftRows.map(({vertex,fields})=>({...vertex,x:fields.x.value.trim()?Number(fields.x.value):NaN,y:fields.y.value.trim()?Number(fields.y.value):NaN,border:fields.border.value,lanes:fields.lanes.value,minimum:fields.minimum.value.trim()?Number(fields.minimum.value):null}));
}
function drawPlotDraft() {
    const list=document.getElementById('plot-vertices');list.replaceChildren();plotDraftRows=[];
    plotDraftVertices.forEach((vertex,i)=>{
        const row=document.createElement('fieldset'),legend=document.createElement('legend');
        const next=plotDraftVertices[(i+1)%plotDraftVertices.length];
        legend.textContent=`Вершина ${i+1} → сторона ${i+1}: ${Math.hypot(next.x-vertex.x,next.y-vertex.y).toFixed(2)} м`;row.appendChild(legend);
        const fields={};
        for(const [key,title] of Object.entries({x:'X (м)',y:'Y (м)',border:'Соседство этой стороны',lanes:'Полосы дороги этой стороны',minimum:'Мой минимальный отступ (м)'})) {
            const label=document.createElement('label'),input=document.createElement(['border','lanes'].includes(key)?'select':'input');
            input.id=vertex.id+'-'+key;label.setAttribute('for',input.id);label.textContent=title;
            if(key==='border'||key==='lanes')for(const [value,name] of Object.entries(key==='border'?{'':'Неизвестно',...YardMap.borderLabels}:{unknown:'Неизвестно',one:'Одна',two:'Две'})) {const option=document.createElement('option');option.value=value;option.textContent=name;input.appendChild(option);}
            else {input.type='number';input.min='0';input.step='any';}
            input.value=vertex[key]===null?'':String(vertex[key]);fields[key]=input;row.append(label,input);
        }
        const insert=document.createElement('button');insert.type='button';insert.textContent='Добавить вершину после';insert.disabled=plotDraftVertices.length>=100;
        insert.addEventListener('click',()=>{readPlotDraft();const a=plotDraftVertices[i],b=plotDraftVertices[(i+1)%plotDraftVertices.length];plotDraftVertices.splice(i+1,0,{id:'vertex-'+plotDraftCounter++,x:(a.x+b.x)/2,y:(a.y+b.y)/2,border:'',lanes:'unknown',minimum:null});drawPlotDraft();});
        const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить вершину';remove.disabled=plotDraftVertices.length<=3;
        remove.addEventListener('click',()=>{readPlotDraft();plotDraftVertices.splice(i,1);drawPlotDraft();});
        row.append(insert,remove);list.appendChild(row);plotDraftRows.push({vertex,fields,legend});
        for(const key of ['x','y'])fields[key].addEventListener('input',()=>{readPlotDraft();plotDraftRows.forEach((r,j)=>{const a=plotDraftVertices[j],b=plotDraftVertices[(j+1)%plotDraftVertices.length],length=Math.hypot(b.x-a.x,b.y-a.y);r.legend.textContent=`Вершина ${j+1} → сторона ${j+1}: ${Number.isFinite(length)?length.toFixed(2)+' м':'укажите координаты'}`;});});
    });
}
function renderPlotContour() {
    if(plotDraftIdentity!==project||plotDraftSource!==JSON.stringify(project.plot))resetPlotContour();
    for(const side of ['north','east','south','west'])document.getElementById(side+'-side').disabled=project.plot?.kind==='polygon';
}
function applyPlotContour() {
    readPlotDraft();
    try {
        cancelDrag();stopPan();YardMap.setPolygon(project,plotDraftVertices,plotDraftCounter);
        renderer.focusedCheck=null;viewState.zoom=1;viewState.panX=0;viewState.panY=0;
        render();saveCommittedProject();
    } catch(error) {document.getElementById('plot-contour-error').textContent=error.message;}
}
document.getElementById('apply-plot-contour').addEventListener('click',applyPlotContour);
document.getElementById('reset-plot-contour').addEventListener('click',resetPlotContour);
renderPlotContour();render();
