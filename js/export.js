(() => {
    const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const number=n=>Number(n.toPrecision(12));
    function pngWithResolution(bytes,dpi=150) {
        const signature=[137,80,78,71,13,10,26,10];
        if(!(bytes instanceof Uint8Array)||!signature.every((n,i)=>bytes[i]===n)||!Number.isFinite(dpi)||dpi<1||dpi>600)throw new Error('Неверные PNG или разрешение.');
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[];let offset=8,ended=false;
        while(offset<bytes.length) {
            if(offset+12>bytes.length)throw new Error('Повреждён PNG.');const length=view.getUint32(offset),end=offset+length+12;
            if(end>bytes.length)throw new Error('Повреждён PNG.');
            const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));
            if(!chunks.length&&type!=='IHDR')throw new Error('Отсутствует заголовок PNG.');
            if(type!=='pHYs')chunks.push(bytes.slice(offset,end));offset=end;
            if(type==='IEND'){ended=true;break;}
        }
        if(!ended||offset!==bytes.length)throw new Error('Повреждён PNG.');
        const phys=new Uint8Array(21),pv=new DataView(phys.buffer);pv.setUint32(0,9);phys.set([112,72,89,115],4);
        pv.setUint32(8,Math.round(dpi/.0254));pv.setUint32(12,Math.round(dpi/.0254));phys[16]=1;
        let crc=0xffffffff;for(const byte of phys.slice(4,17)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
        pv.setUint32(17,(crc^0xffffffff)>>>0);chunks.splice(1,0,phys);
        const result=new Uint8Array(8+chunks.reduce((sum,c)=>sum+c.length,0));result.set(signature);offset=8;
        for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
    }
    function buildPrintDocument(result,url) {
        if(typeof url!=='string'||!url.startsWith('blob:')||![result.widthMm,result.heightMm].every(n=>Number.isFinite(n)&&n>0))throw new Error('Неверная печатная страница.');
        return `<!DOCTYPE html><html lang="ru"><head><title>План участка</title><style>@page{size:${result.widthMm}mm ${result.heightMm}mm;margin:0}html,body{margin:0;padding:0}img{display:block;width:${result.widthMm}mm;height:${result.heightMm}mm}</style></head><body><img alt="Печатный план" src="${escapeXml(url)}"></body></html>`;
    }
    function buildPlanSvg(project,options={}) {
        const api=typeof module!=='undefined'&&module.exports?{...require('./catalog.js'),...require('./shapes.js'),...require('./geometry.js')}:globalThis.YardMap;
        if(!project.plot)throw new Error('Сначала создайте участок.');
        const paper=options.paper??'A4',orientation=options.orientation??'landscape';
        if(!['A4','A3'].includes(paper)||!['landscape','portrait'].includes(orientation))throw new Error('Бумага: A4/A3, книжная или альбомная.');
        const dimensions=paper==='A4'?[210,297]:[297,420];
        const [widthMm,heightMm]=orientation==='landscape'?[dimensions[1],dimensions[0]]:dimensions;
        const characters=[...project.name],titleRows=[],titleWidth=Math.floor((widthMm-20)/5);
        for(let i=0;i<characters.length;i+=titleWidth)titleRows.push(characters.slice(i,i+titleWidth).join(''));
        const headerExtra=(titleRows.length-1)*6;
        const placed=project.objects.filter(o=>o.status==='placed'),rects=placed.map(api.objectRect);
        for(const c of project.assessment?.constraints??[])rects.push({left:Math.min(c.x1,c.x2),right:Math.max(c.x1,c.x2),top:Math.min(c.y1,c.y2),bottom:Math.max(c.y1,c.y2)});
        const left=Math.min(0,...rects.map(r=>r.left)),top=Math.min(0,...rects.map(r=>r.top));
        const right=Math.max(project.plot.width,...rects.map(r=>r.right)),bottom=Math.max(project.plot.length,...rects.map(r=>r.bottom));
        const types=Object.keys(api.definitions).filter(t=>placed.some(o=>o.type===t));
        const constraints=project.assessment?.constraints??[];
        const legendHeight=12+Math.ceil(types.length/2)*5+(constraints.length?5:0),availableWidth=widthMm-30,availableHeight=heightMm-48-legendHeight-headerExtra;
        const minimumScale=Math.max((right-left)*1000/availableWidth,(bottom-top)*1000/availableHeight);
        const requested=options.scale??'fit',scale=requested==='fit'?Math.max(10,Math.ceil(minimumScale/10)*10):requested;
        if(!Number.isFinite(scale)||scale<=0)throw new Error('Масштаб должен быть положительным числом или «Вписать».');
        if(scale+1e-9<minimumScale)throw new Error(`План не помещается: выберите масштаб не меньше 1:${Math.ceil(minimumScale)} или «Вписать».`);
        const factor=1000/scale,tx=15-left*factor+(availableWidth-(right-left)*factor)/2,ty=27+headerExtra-top*factor+(availableHeight-(bottom-top)*factor)/2;
        const background=project.background;
        if(background?.visible&&!background.dataUrl)throw new Error('Изображение подложки отсутствует. Загрузите его повторно или скройте подложку.');
        const text=(x,y,value,size=3,extra='')=>`<text x="${number(x)}" y="${number(y)}" font-size="${number(size)}" ${extra}>${escapeXml(value)}</text>`;
        const points=api.plotEdges(project.plot).map(e=>`${number(e.a.x)},${number(e.a.y)}`).join(' ');
        const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
            '<rect width="100%" height="100%" fill="white"/>',`<g font-family="Arial, sans-serif" fill="#263238">`,
            ...titleRows.map((row,i)=>text(10,12+i*6,row,5)),text(10,19+headerExtra,`${paper} · ${orientation==='landscape'?'альбомная':'книжная'} · ${widthMm} × ${heightMm} мм · Масштаб 1:${number(scale)} · Участок ${api.plotArea(project.plot).toFixed(2)} м²`),
            `<defs><clipPath id="plot-clip"><polygon points="${points}"/></clipPath></defs>`,
            `<g transform="translate(${number(tx)} ${number(ty)}) scale(${number(factor)})">`,
            `<polygon points="${points}" fill="#f0f7ed"/>`];
        if(background?.visible)parts.push(`<image href="${escapeXml(background.dataUrl)}" x="${number(background.x)}" y="${number(background.y)}" width="${number(background.pixelWidth*background.metresPerPixel)}" height="${number(background.pixelHeight*background.metresPerPixel)}" opacity="${background.opacity}" preserveAspectRatio="none" clip-path="url(#plot-clip)"/>`);
        parts.push(`<polygon points="${points}" fill="none" stroke="#263238" stroke-width="${number(.4/factor)}"/>`);
        for(const o of placed) {
            const r=api.objectRect(o),color=api.definitions[o.type].color,stroke=.3/factor;
            if(o.geometry?.kind==='circle')parts.push(`<circle cx="${number(o.x)}" cy="${number(o.y)}" r="${number(o.geometry.radius)}" fill="${color}" stroke="#37474f" stroke-width="${number(stroke)}"/><circle cx="${number(o.x)}" cy="${number(o.y)}" r="${number(.6/factor)}" fill="#37474f"/>`);
            else if(o.geometry?.kind==='line'){const [a,b]=api.linePoints(o);parts.push(`<line x1="${number(a.x)}" y1="${number(a.y)}" x2="${number(b.x)}" y2="${number(b.y)}" stroke="${color}" stroke-width="${number(.8/factor)}"/>`);}
            else parts.push(`<rect x="${number(r.left)}" y="${number(r.top)}" width="${number(r.right-r.left)}" height="${number(r.bottom-r.top)}" fill="${color}" stroke="#37474f" stroke-width="${number(stroke)}"/>`);
            parts.push(text((r.left+r.right)/2,(r.top+r.bottom)/2,(o.assessment?.ownership==='neighbor'?'Сосед: ':'')+o.name,2.6/factor,'text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="'+number(.6/factor)+'"'));
        }
        for(const e of api.plotEdges(project.plot))parts.push(text((e.a.x+e.b.x)/2,(e.a.y+e.b.y)/2-1.6/factor,`${e.length.toFixed(2)} м${e.border?' · '+api.borderLabels[e.border]:''}`,2.7/factor,'text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="'+number(.7/factor)+'"'));
        for(const c of constraints)parts.push(`<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="#a1487d" stroke-dasharray="${number(1/factor)} ${number(1/factor)}" stroke-width="${number(.35/factor)}"/>`,text((c.x1+c.x2)/2,(c.y1+c.y2)/2-1.6/factor,c.name,2.7/factor,'text-anchor="middle"'));
        parts.push('</g>');
        const legendY=heightMm-legendHeight-12;
        parts.push(text(10,legendY,'Легенда',3.5));
        types.forEach((type,i)=>{const x=10+(i%2)*(widthMm/2),y=legendY+6+Math.floor(i/2)*5;parts.push(`<rect x="${x}" y="${y-3}" width="3" height="3" fill="${api.definitions[type].color}"/>`,text(x+5,y,`${api.definitions[type].name}: ${placed.filter(o=>o.type===type).length}`));});
        if(constraints.length)parts.push(text(10,legendY+6+Math.ceil(types.length/2)*5,`Ограничения: ${constraints.length} (фиолетовый пунктир).`));
        // A physical 25–50 mm bar, with a round world length, independent of viewport zoom.
        const world=scale*.04,unit=10**Math.floor(Math.log10(world)),barMetres=Math.floor(world/unit)*unit,barWidth=barMetres*factor;
        const barY=heightMm-10;parts.push(`<line x1="10" y1="${barY}" x2="${number(10+barWidth)}" y2="${barY}" stroke="black" stroke-width=".7"/>`,text(10,barY-3,`Масштабная линейка: ${number(barMetres)} м`,2.8));
        parts.push(text(widthMm/2,barY,`В ожидании: ${project.objects.length-placed.length}. Печать: 100%, без подгонки.`,2.8),'</g></svg>');
        return {svg:parts.join('\n'),widthMm,heightMm,scale,paper,orientation};
    }
    const api={buildPlanSvg,escapeXml,pngWithResolution,buildPrintDocument};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
