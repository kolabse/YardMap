(() => {
    const maxImageBytes=1024*1024;
    function normalizeBackground(value) {
        if(value===null||value===undefined)return null;
        if(typeof value!=='object'||Array.isArray(value))throw new Error('Подложка: ожидается объект.');
        const {name,dataUrl,pixelWidth,pixelHeight,metresPerPixel,x,y,opacity,locked,visible}=value;
        if(typeof name!=='string'||!name.trim()||name.length>200)throw new Error('Укажите название изображения до 200 символов.');
        if(![pixelWidth,pixelHeight].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||pixelWidth*pixelHeight>24000000)throw new Error('Изображение: до 16384 пикселей по стороне и 24 миллионов пикселей.');
        if(!Number.isFinite(metresPerPixel)||metresPerPixel<=0||![pixelWidth*metresPerPixel,pixelHeight*metresPerPixel].every(Number.isFinite)||![x,y].every(Number.isFinite))throw new Error('Положение и масштаб подложки должны быть конечными; масштаб — больше нуля.');
        if(!Number.isFinite(opacity)||opacity<0||opacity>1||typeof locked!=='boolean'||typeof visible!=='boolean')throw new Error('Неверные прозрачность, видимость или фиксация подложки.');
        if(dataUrl!==null) {
            const match=typeof dataUrl==='string'&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
            if(!match||match[2].length%4!==0||match[2].length/4*3-(match[2].endsWith('==')?2:match[2].endsWith('=')?1:0)>maxImageBytes)throw new Error('Подложка: встроенное PNG/JPEG/WebP не больше 1 МиБ или отсутствующее изображение.');
            if(!match[2].startsWith({png:'iVBORw0KGgo',jpeg:'/9j/',webp:'UklGR'}[match[1]]))throw new Error('Данные не соответствуют формату изображения.');
        }
        return {name,dataUrl,pixelWidth,pixelHeight,metresPerPixel,x,y,opacity,locked,visible};
    }
    function setBackground(project,value) {
        if(!project.plot&&value)throw new Error('Сначала создайте участок.');
        const background=normalizeBackground(value);
        if(background) {project.version=2;if(project.plot.kind!=='polygon')project.plot.kind='rectangle';}
        project.background=background;
    }
    function updateBackground(project,patch) {
        if(!project.background)throw new Error('Сначала загрузите подложку.');
        if(project.background.locked&&['x','y','metresPerPixel','dataUrl','pixelWidth','pixelHeight'].some(k=>Object.hasOwn(patch,k)&&patch[k]!==project.background[k]))throw new Error('Сначала разблокируйте положение подложки.');
        const candidate=normalizeBackground({...project.background,...patch});project.background=candidate;
    }
    function calibrateBackground(project,a,b,metres) {
        const image=project.background;if(!image)throw new Error('Сначала загрузите подложку.');
        if(image.locked)throw new Error('Сначала разблокируйте положение подложки.');
        if(![a,b].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=image.pixelWidth&&p.y<=image.pixelHeight)||!Number.isFinite(metres)||metres<=0)throw new Error('Точки должны быть внутри изображения; известное расстояние — больше нуля.');
        const pixels=Math.hypot(b.x-a.x,b.y-a.y);if(!pixels)throw new Error('Точки калибровки должны различаться.');
        updateBackground(project,{metresPerPixel:metres/pixels});
    }
    const api={normalizeBackground,setBackground,updateBackground,calibrateBackground,maxImageBytes};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
