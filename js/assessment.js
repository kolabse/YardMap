(() => {
    const choices = {
        territory:['unknown','gardening','other'], sewer:['unknown','yes','no'],
        ownership:['unknown','own','neighbor'],
        purpose:['unknown','house','outbuilding','poultry','outdoor_toilet','biotoilet','bath','shower','well','garage','carport','open_parking','veranda'],
        standalone:['unknown','yes','no'], measurement:['unknown','wall'], drainage:['unknown','own','neighbor'],
        lanes:['unknown','one','two'], kind:['redline','road_edge','fence','restriction']
    };
    const sides=['left','right','top','bottom'];
    function record(v) { if(!v || typeof v!=='object' || Array.isArray(v)) throw new Error('Сведения для проверки: ожидается объект.'); }
    function choice(v,key) { if(!choices[key].includes(v)) throw new Error(`Сведения для проверки: неверное поле ${key}.`); return v; }
    function number(v,label,nullable=true) {
        if(v===null && nullable)return null;
        if(!Number.isFinite(v)||v<0)throw new Error(`${label}: требуется неотрицательное конечное число.`);
        return v;
    }
    function text(v,label) { if(typeof v!=='string'||!v.trim()||v.length>200)throw new Error(`${label}: требуется название до 200 символов.`);return v; }
    function point(v) { record(v); if(!Number.isFinite(v.x)||!Number.isFinite(v.y))throw new Error('Неверные координаты точки.');return {x:v.x,y:v.y}; }
    function objectAssessment(value) {
        const v=value??{ownership:'unknown',purpose:'unknown',standalone:'unknown',measurement:'unknown',
            projections:{left:null,right:null,top:null,bottom:null},height:null,drainage:'unknown',attachedTo:null,windows:null};
        record(v);record(v.projections);
        if(v.attachedTo!==null && (typeof v.attachedTo!=='string'||!v.attachedTo.trim()))throw new Error('Неверная связь пристройки.');
        if(v.windows!==null && (!Array.isArray(v.windows)||v.windows.length>100))throw new Error('Окна: максимум 100 точек.');
        return { ownership:choice(v.ownership,'ownership'),purpose:choice(v.purpose,'purpose'),
            standalone:choice(v.standalone,'standalone'),measurement:choice(v.measurement,'measurement'),
            projections:Object.fromEntries(sides.map(s=>[s,number(v.projections[s],'Выступ')])),
            height:number(v.height,'Высота'),drainage:choice(v.drainage,'drainage'),attachedTo:v.attachedTo,
            windows:v.windows===null?null:v.windows.map(point) };
    }
    function projectAssessment(value) {
        const v=value??{territory:'unknown',sewer:'unknown',localRoadMinimum:null,
            lanes:{north:'unknown',east:'unknown',south:'unknown',west:'unknown'},constraints:[]};
        record(v);record(v.lanes);
        if(!Array.isArray(v.constraints)||v.constraints.length>100)throw new Error('Линии ограничений: максимум 100.');
        const ids=new Set();
        const constraints=v.constraints.map(line=>{
            record(line);const id=text(line.id,'ID линии');if(ids.has(id))throw new Error('Повторяющийся ID линии.');ids.add(id);
            for(const key of ['x1','y1','x2','y2'])if(!Number.isFinite(line[key]))throw new Error('Неверные координаты линии.');
            if(line.x1===line.x2&&line.y1===line.y2)throw new Error('Линия должна иметь ненулевую длину.');
            return {id,kind:choice(line.kind,'kind'),name:text(line.name,'Линия'),x1:line.x1,y1:line.y1,x2:line.x2,y2:line.y2,minimum:number(line.minimum,'Отступ линии',false)};
        });
        return {territory:choice(v.territory,'territory'),sewer:choice(v.sewer,'sewer'),localRoadMinimum:number(v.localRoadMinimum,'Местный отступ'),
            lanes:Object.fromEntries(['north','east','south','west'].map(s=>[s,choice(v.lanes[s],'lanes')])),constraints};
    }
    function validateConnections(objects) {
        const ids=new Map(objects.map(o=>[o.id,o]));
        for(const o of objects) {
            const seen=new Set([o.id]);let current=o;
            while(current?.assessment?.attachedTo) {
                const id=current.assessment.attachedTo;
                if(!ids.has(id)||seen.has(id))throw new Error('Пристройка: объект отсутствует или связь циклическая.');
                seen.add(id);current=ids.get(id);
            }
            for(const p of o.assessment?.windows??[])if(p.x<0||p.y<0||p.x>o.width||p.y>o.length||
                (p.x!==0&&p.x!==o.width&&p.y!==0&&p.y!==o.length))throw new Error('Окно должно находиться на стене исходного контура объекта.');
        }
    }
    const api={assessmentChoices:choices,objectAssessment,projectAssessment,validateConnections};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
