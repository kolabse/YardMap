const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../js/model'),files=require('../js/project-file'),g=require('../js/geometry');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk9sAAAAASUVORK5CYII=';
const image={name:'Схема.png',dataUrl:png,pixelWidth:100,pixelHeight:80};
function plan(){const p=m.createProject();m.setPlot(p,20,35);return p;}
test('embedded background survives JSON and calibration does not move geometry',()=>{
 const p=plan(),o=m.addObject(p,'house',5,6);m.placeObject(p,o.id,3,4);const before=JSON.stringify(p.objects);
 assert.equal(typeof m.setBackground,'function');m.setBackground(p,{...image,metresPerPixel:.1,x:2,y:3,opacity:.4,locked:false,visible:true});
 m.calibrateBackground(p,{x:10,y:20},{x:60,y:20},10);
 assert.equal(p.background.metresPerPixel,.2);assert.equal(JSON.stringify(p.objects),before);assert.equal(g.areaSummary(p).plot,700);
 assert.equal(p.version,2);assert.equal(p.plot.kind,'rectangle');assert.deepEqual(files.parseProject(files.serializeProject(p)),p);
});
test('background validation and position locking are atomic while visibility and opacity remain editable',()=>{
 const p=plan();m.setBackground(p,{...image,metresPerPixel:.1,x:0,y:0,opacity:.5,locked:true,visible:true});const before=JSON.stringify(p);
 assert.throws(()=>m.updateBackground(p,{x:2}));assert.throws(()=>m.calibrateBackground(p,{x:0,y:0},{x:20,y:0},2));assert.equal(JSON.stringify(p),before);
 m.updateBackground(p,{opacity:.25,visible:false});assert.equal(p.background.opacity,.25);
 m.updateBackground(p,{locked:false});assert.throws(()=>m.calibrateBackground(p,{x:0,y:0},{x:0,y:0},10));
 assert.throws(()=>m.calibrateBackground(p,{x:-1,y:0},{x:20,y:0},10));assert.throws(()=>m.updateBackground(p,{opacity:2}));
 const data=JSON.parse(files.serializeProject(p));data.background.dataUrl='https://example.org/private.png';assert.throws(()=>files.parseProject(JSON.stringify(data)));
 data.background.dataUrl='data:image/svg+xml;base64,PHN2Zz4=';assert.throws(()=>files.parseProject(JSON.stringify(data)));
 data.background.dataUrl=null;assert.equal(files.parseProject(JSON.stringify(data)).background.dataUrl,null);
});
test('export has physical paper size, true contour, placed shapes, lengths, legend and explicit scale',()=>{
 const p=plan();p.name='<Дача & сад>';m.setPolygon(p,[[0,0],[10,0],[8,6],[2,6]].map(([x,y],i)=>({id:'vertex-'+(i+1),x,y})));
 const o=m.addObject(p,'house',2,2);o.name='<Дом>';m.placeObject(p,o.id,3,2);const waiting=m.addObject(p,'shed',1,1);waiting.name='NOT_PLACED';
 const t=m.addObject(p,'tree',2,2);m.placeObject(p,t.id,6,3);
 assert.equal(typeof g.buildPlanSvg,'function');const result=g.buildPlanSvg(p,{paper:'A4',orientation:'landscape',scale:100});
 assert.equal(result.widthMm,297);assert.equal(result.heightMm,210);assert.equal(result.scale,100);
 assert.match(result.svg,/width="297mm"/);assert.match(result.svg,/&lt;Дача &amp; сад&gt;/);assert.match(result.svg,/&lt;Дом&gt;/);
 assert.match(result.svg,/polygon/);assert.match(result.svg,/circle/);assert.match(result.svg,/6\.32 м/);assert.match(result.svg,/1:100/);
 assert.match(result.svg,/Легенда/);assert.match(result.svg,/Масштабная линейка/);assert.doesNotMatch(result.svg,/NOT_PLACED|selected-building|foreignObject/);
 const before=files.serializeProject(p);g.buildPlanSvg(p,{paper:'A3',orientation:'portrait',scale:'fit'});assert.equal(files.serializeProject(p),before);
});
test('export rejects clipping at fixed print scale and missing visible image; hidden background can be omitted',()=>{
 const p=plan();assert.equal(typeof g.buildPlanSvg,'function');assert.throws(()=>g.buildPlanSvg(p,{paper:'A4',orientation:'landscape',scale:20}),/масштаб|помещ/);
 const result=g.buildPlanSvg(p,{paper:'A4',orientation:'landscape',scale:'fit'});assert.ok(result.scale>=200);
 m.setBackground(p,{...image,metresPerPixel:.1,x:0,y:0,opacity:.5,locked:false,visible:true});assert.match(g.buildPlanSvg(p).svg,/<image/);
 m.updateBackground(p,{dataUrl:null});assert.throws(()=>g.buildPlanSvg(p),/изображен|подложк/);m.updateBackground(p,{visible:false});assert.doesNotMatch(g.buildPlanSvg(p).svg,/<image/);
});
test('PNG export records 150 dpi as physical resolution instead of canvas default',()=>{
 const api=require('../js/export');assert.equal(typeof api.pngWithResolution,'function');
 const bytes=api.pngWithResolution(new Uint8Array(Buffer.from(png.split(',')[1],'base64')),150);
 const output=Buffer.from(bytes),index=output.indexOf('pHYs');assert.ok(index>0);
 assert.equal(output.readUInt32BE(index+4),5906);assert.equal(output.readUInt32BE(index+8),5906);assert.equal(output[index+12],1);
 assert.equal(output.indexOf('pHYs',index+1),-1);assert.throws(()=>api.pngWithResolution(new Uint8Array([1,2,3]),150));
});
test('print document uses the selected physical page and excludes editor controls',()=>{
 const api=require('../js/export');assert.equal(typeof api.buildPrintDocument,'function');
 const result=g.buildPlanSvg(plan(),{paper:'A3',orientation:'portrait'});
 const html=api.buildPrintDocument(result,'blob:http://localhost/plan');
 assert.match(html,/@page\{size:297mm 420mm;margin:0\}/);assert.match(html,/width:297mm;height:420mm/);
 assert.doesNotMatch(html,/<button|<script|iframe|object-panel/);assert.throws(()=>api.buildPrintDocument(result,'https://example.org/image.png'));
});
test('portable project size is bounded by UTF-8 bytes for both import and export',()=>{
 const p=plan();for(let i=0;i<1000;i++)m.addObject(p,'shed',1,1).name='Я'.repeat(200);
 m.setBackground(p,{...image,dataUrl:'data:image/png;base64,'+Buffer.concat([Buffer.from(png.split(',')[1],'base64'),Buffer.alloc(900000)]).toString('base64'),metresPerPixel:.1,x:0,y:0,opacity:.5,locked:false,visible:true});
 assert.throws(()=>files.serializeProject(p),/2 МиБ/);
 const data=plan();data.ignored='Я'.repeat(1100000);assert.throws(()=>files.parseProject(JSON.stringify(data)),/2 МиБ/);
});
test('export retains rotated lines and annotates neighboring objects and named constraints',()=>{
 const p=plan(),o=m.addObject(p,'house',2,3);m.placeObject(p,o.id,-5,2);o.assessment.ownership='neighbor';
 const line=m.addObject(p,'communication',4,2,{kind:'line',dx:-4,dy:2});m.placeObject(p,line.id,10,10);line.rotation=90;
 p.assessment.constraints=[{id:'line-1',name:'Моя линия',kind:'restriction',x1:-50,y1:-50,x2:50,y2:100,minimum:1}];
 const result=g.buildPlanSvg(p);assert.ok(result.scale>500);assert.match(result.svg,/x1="10" y1="10" x2="8" y2="6"/);
 assert.match(result.svg,/Сосед: Дом/);assert.match(result.svg,/Моя линия/);assert.match(result.svg,/Ограничения: 1/);
});
test('long printable project name wraps while leaving space for the plan',()=>{
 const p=plan(),base=g.buildPlanSvg(p);p.name='W'.repeat(200);const result=g.buildPlanSvg(p);
 assert.ok(result.scale>base.scale);assert.equal((result.svg.match(/font-size="5"/g)||[]).length,4);
 assert.equal((result.svg.match(/W/g)||[]).length,200);
});
