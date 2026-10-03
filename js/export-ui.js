let planPreviewUrl=null,planPreviewState=null;
function exportOptions() {
    const value=document.getElementById('export-scale').value.trim();
    return {paper:document.getElementById('export-paper').value||'A4',orientation:document.getElementById('export-orientation').value||'landscape',scale:value?Number(value):'fit'};
}
function planExportKey() {return JSON.stringify(project)+'|'+JSON.stringify(exportOptions());}
function invalidatePlanPreview() {
    if(planPreviewState&&planPreviewState!==planExportKey()) {
        document.getElementById('export-preview').hidden=true;
        document.getElementById('export-preview').src='';
        if(planPreviewUrl)URL.revokeObjectURL(planPreviewUrl);planPreviewUrl=null;planPreviewState=null;
        document.getElementById('export-status').textContent='План или параметры печати изменены. Обновите предпросмотр.';
    }
}
async function preparePlanExport() {
    // Snapshot before decoding: asynchronous image work cannot mix two project states.
    const sourceKey=planExportKey(),snapshot=YardMap.parseProject(YardMap.serializeProject(project)),result=YardMap.buildPlanSvg(snapshot,exportOptions());
    if(snapshot.background?.visible) {
        const image=await decodedLocalImage(snapshot.background.dataUrl);
        if(image.naturalWidth!==snapshot.background.pixelWidth||image.naturalHeight!==snapshot.background.pixelHeight)throw new Error('Размеры подложки не совпадают с сохранёнными. Загрузите изображение повторно.');
    }
    if(sourceKey!==planExportKey())throw new Error('План изменился во время подготовки экспорта. Повторите действие.');
    result.sourceKey=sourceKey;
    document.getElementById('export-status').textContent=`${result.paper}: ${result.widthMm} × ${result.heightMm} мм; масштаб 1:${Number(result.scale.toPrecision(8))}. PNG: 150 dpi. Экспорт снимка текущего варианта.`;
    document.getElementById('export-error').textContent='';return result;
}
function downloadPlanBlob(blob,filename) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportAction(action) {
    try {return await action();}catch(error){document.getElementById('export-error').textContent=error.message;return null;}
}
function downloadPlanSvg() {
    return exportAction(async()=>{const result=await preparePlanExport();downloadPlanBlob(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}),'yardmap-plan.svg');});
}
async function planRaster(result) {
    const url=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}));
    try {
        const image=await decodedLocalImage(url),canvas=document.createElement('canvas');
        canvas.width=Math.round(result.widthMm/.0254/1000*150);canvas.height=Math.round(result.heightMm/.0254/1000*150);
        const context=canvas.getContext('2d');if(!context)throw new Error('Браузер не поддерживает PNG-экспорт. Скачайте SVG.');
        context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось создать PNG.')),'image/png'));
        return new Blob([YardMap.pngWithResolution(new Uint8Array(await blob.arrayBuffer()),150)],{type:'image/png'});
    } finally {URL.revokeObjectURL(url);}
}
function downloadPlanPng() {return exportAction(async()=>{const result=await preparePlanExport();downloadPlanBlob(await planRaster(result),'yardmap-plan.png');});}
function previewPlan() {
    return exportAction(async()=>{
        const result=await preparePlanExport(),raster=await planRaster(result);
        if(result.sourceKey!==planExportKey())throw new Error('План изменился во время подготовки предпросмотра. Повторите действие.');
        if(planPreviewUrl)URL.revokeObjectURL(planPreviewUrl);
        planPreviewUrl=URL.createObjectURL(raster);planPreviewState=result.sourceKey;
        const preview=document.getElementById('export-preview');preview.src=planPreviewUrl;preview.hidden=false;return result;
    });
}
function printPlan() {
    return exportAction(async()=>{
        const result=await preparePlanExport(),raster=await planRaster(result);
        if(result.sourceKey!==planExportKey())throw new Error('План изменился во время подготовки печати. Повторите действие.');
        const frame=document.createElement('iframe');frame.className='print-frame';frame.title='Печатный план';document.body.appendChild(frame);
        const url=URL.createObjectURL(raster);
        try {
            const doc=frame.contentDocument;
            doc.open();doc.write(YardMap.buildPrintDocument(result,url));doc.close();
            await new Promise((resolve,reject)=>{const image=doc.querySelector('img');image.onload=resolve;image.onerror=()=>reject(new Error('Не удалось подготовить страницу печати.'));if(image.complete&&image.naturalWidth)resolve();});
            // Keep the page alive while the print dialog is open; cleanup after it closes.
            frame.contentWindow.addEventListener('afterprint',()=>{URL.revokeObjectURL(url);frame.remove();},{once:true});
            frame.contentWindow.focus();frame.contentWindow.print();
        }catch(error){URL.revokeObjectURL(url);frame.remove();throw error;}
    });
}
document.getElementById('export-svg').addEventListener('click',downloadPlanSvg);
document.getElementById('export-png').addEventListener('click',downloadPlanPng);
document.getElementById('preview-plan').addEventListener('click',previewPlan);
document.getElementById('print-plan').addEventListener('click',printPlan);
for(const id of ['export-paper','export-orientation','export-scale'])document.getElementById(id).addEventListener('input',invalidatePlanPreview);
YardMap.invalidatePlanPreview=invalidatePlanPreview;
