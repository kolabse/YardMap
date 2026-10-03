let backgroundPanelIdentity=null,backgroundPanelSource=null,backgroundLoadId=0,calibrationPointIndex=0;
const backgroundField=id=>document.getElementById(id);
function renderBackgroundControls() {
    const image=project.background,source=JSON.stringify(image);
    backgroundField('background-controls').hidden=!image;
    if(backgroundPanelIdentity!==project||backgroundPanelSource!==source) {
        backgroundPanelIdentity=project;backgroundPanelSource=source;calibrationPointIndex=0;
        backgroundField('background-error').textContent='';backgroundField('calibration-selection').textContent='';
        if(image) {
            for(const key of ['x','y','opacity'])backgroundField('background-'+key).value=String(image[key]);
            backgroundField('background-visible').checked=image.visible;
            backgroundField('background-preview').src=image.dataUrl??'';backgroundField('background-preview').hidden=!image.dataUrl;
        }
    }
    backgroundField('background-summary').textContent=image?`${image.name}: ${image.pixelWidth} × ${image.pixelHeight} px; ${Number(image.metresPerPixel.toPrecision(8))} м/px; размер ${Number((image.pixelWidth*image.metresPerPixel).toPrecision(8))} × ${Number((image.pixelHeight*image.metresPerPixel).toPrecision(8))} м.${!image.dataUrl?' Изображение отсутствует: загрузите повторно или скройте подложку перед экспортом.':''}`:'Подложка не загружена.';
    for(const id of ['background-x','background-y','calibrate-background','background-file'])backgroundField(id).disabled=!!image?.locked;
    for(const key of ['ax','ay','bx','by','distance'])backgroundField('calibration-'+key).disabled=!!image?.locked;
    backgroundField('background-preview').setAttribute('aria-disabled',String(!!image?.locked));
    backgroundField('lock-background').textContent=image?.locked?'Разблокировать подложку':'Закрепить положение подложки';
}
function backgroundAction(action) {
    try {cancelDrag();stopPan();action();render();saveCommittedProject();}
    catch(error){backgroundField('background-error').textContent=error.message;}
}
function applyBackgroundSettings() {
    backgroundAction(()=>{
        if(!backgroundField('background-opacity').value.trim())throw new Error('Укажите непрозрачность от 0 до 1.');
        const patch={opacity:Number(backgroundField('background-opacity').value),visible:backgroundField('background-visible').checked};
        if(!project.background?.locked) {
            for(const key of ['x','y']){if(!backgroundField('background-'+key).value.trim())throw new Error('Укажите X и Y подложки.');patch[key]=Number(backgroundField('background-'+key).value);}
        }
        YardMap.updateBackground(project,patch);
    });
}
function applyBackgroundCalibration() {
    backgroundAction(()=>{
        const value=key=>{const text=backgroundField('calibration-'+key).value;if(!text.trim())throw new Error('Укажите обе точки и известное расстояние.');return Number(text);};
        YardMap.calibrateBackground(project,{x:value('ax'),y:value('ay')},{x:value('bx'),y:value('by')},value('distance'));
    });
}
function decodedLocalImage(dataUrl) {
    return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Не удалось прочитать изображение. Выберите исправное PNG/JPEG/WebP.'));image.src=dataUrl;});
}
async function loadBackgroundFile(event) {
    const file=event.target.files?.[0];if(!file)return;
    const identity=project,previous=project.background,id=++backgroundLoadId;
    try {
        if(previous?.locked)throw new Error('Сначала разблокируйте положение подложки.');
        if(!project.plot)throw new Error('Сначала создайте участок.');
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>YardMap.maxImageBytes)throw new Error('Выберите PNG/JPEG/WebP до 1 МиБ.');
        const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));reader.readAsDataURL(file);});
        const image=await decodedLocalImage(dataUrl);
        if(id!==backgroundLoadId||identity!==project||previous!==project.background)throw new Error('План изменился во время загрузки. Выберите изображение повторно.');
        backgroundAction(()=>YardMap.setBackground(project,{name:file.name.slice(0,200),dataUrl,pixelWidth:image.naturalWidth,pixelHeight:image.naturalHeight,metresPerPixel:Math.min(project.plot.width/image.naturalWidth,project.plot.length/image.naturalHeight),x:0,y:0,opacity:.5,locked:false,visible:true}));
        backgroundField('calibration-ax').value='0';backgroundField('calibration-ay').value='0';backgroundField('calibration-bx').value=String(image.naturalWidth);backgroundField('calibration-by').value='0';
    }catch(error){backgroundField('background-error').textContent=error.message;}
    finally {event.target.value='';}
}
backgroundField('background-preview').addEventListener('click',event=>{
    const image=project.background;if(!image?.dataUrl||image.locked)return;
    const rect=event.currentTarget.getBoundingClientRect(),point={x:(event.clientX-rect.left)*image.pixelWidth/rect.width,y:(event.clientY-rect.top)*image.pixelHeight/rect.height},prefix=calibrationPointIndex%2===0?'a':'b';
    backgroundField('calibration-'+prefix+'x').value=String(Number(point.x.toFixed(3)));backgroundField('calibration-'+prefix+'y').value=String(Number(point.y.toFixed(3)));calibrationPointIndex++;
    backgroundField('calibration-selection').textContent=prefix==='a'?'Первая точка выбрана. Выберите вторую.':'Обе точки выбраны. Укажите известное расстояние и нажмите «Калибровать подложку».';
});
backgroundField('background-preview').addEventListener('error',()=>{if(project.background?.dataUrl)backgroundField('background-error').textContent='Изображение подложки не читается. Загрузите его повторно или скройте перед экспортом.';});
backgroundField('background-file').addEventListener('change',loadBackgroundFile);
backgroundField('apply-background').addEventListener('click',applyBackgroundSettings);
backgroundField('calibrate-background').addEventListener('click',applyBackgroundCalibration);
backgroundField('lock-background').addEventListener('click',()=>backgroundAction(()=>YardMap.updateBackground(project,{locked:!project.background.locked})));
backgroundField('remove-background').addEventListener('click',()=>backgroundAction(()=>{backgroundLoadId++;YardMap.setBackground(project,null);}));
YardMap.renderBackgroundControls=renderBackgroundControls;
renderBackgroundControls();render();
