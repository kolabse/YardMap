(() => {
    const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
    const {ruleDefinitions}=typeof module!=='undefined'&&module.exports?require('./rules.js'):globalThis.YardMap;
    const meta=typeof module!=='undefined'&&module.exports?require('./assessment.js'):globalThis.YardMap;
    const sideKey={left:'west',right:'east',top:'north',bottom:'south'};
    function measurementRect(o,boundary=false) {
        const a=meta.objectAssessment(o.assessment);
        if(a.measurement!=='wall')return null;
        const r=g.objectRect(o);
        if(boundary) {
            if(Object.values(a.projections).some(v=>v===null))return null;
            for(const s of ['left','right','top','bottom'])if(a.projections[s]>.5)r[s]+=a.projections[s]*(s==='left'||s==='top'?-1:1);
        }
        return r;
    }
    function windowPoint(o,p) {
        const turn=((o.rotation%360)+360)%360;
        const local=turn===90?{x:o.length-p.y,y:p.x}:turn===180?{x:o.width-p.x,y:o.length-p.y}:
            turn===270?{x:p.y,y:o.width-p.x}:p;
        return {x:o.x+local.x,y:o.y+local.y};
    }
    function evaluatePlacement(project) {
        const result={checkedObjects:0,issues:[],pairs:[],contacts:0,invalidObjectIds:new Set(),checks:[]};
        if(!project.plot)return result;
        const context=meta.projectAssessment(project.assessment);
        const placed=project.objects.filter(o=>o.status==='placed').sort((a,b)=>a.id.localeCompare(b.id));
        const am=new Map(placed.map(o=>[o.id,meta.objectAssessment(o.assessment)]));
        result.checkedObjects=placed.length;
        const issue=i=>{result.issues.push(i);i.objectIds.forEach(id=>result.invalidObjectIds.add(id));};
        function check(ruleId,ids,actual=null,required=null,missing=[],extra={}) {
            const r=ruleDefinitions[ruleId];
            const status=r.sourceStatus==='pending'?'source_pending':missing.length?'insufficient_data':
                actual===null||required===null?'not_applicable':actual>=required?'pass':'violation';
            const c={ruleId,category:r.category,sourceStatus:r.sourceStatus,title:r.title,source:r.source,
                clause:r.clause,objectIds:[...ids].sort(),actual,required,missing,status,...extra};
            result.checks.push(c);
            if(c.status==='violation')issue({...c,kind:extra.side?'border-gap':'object-gap'});
            return c;
        }
        const profile=context.territory==='gardening';
        for(const o of placed) {
            const a=am.get(o.id);
            if(a.ownership!=='neighbor') {
                const d=g.borderDistances(project.plot,o),sides=Object.keys(d).filter(s=>d[s]<-g.geometryEpsilon);
                if(sides.length)issue({kind:'outside',objectIds:[o.id],sides});
            }
            if(!profile)check('PROFILE',[o.id],null,null,context.territory==='unknown'?['Назначение территории']:[],
                {reason:context.territory==='other'?'Профиль садоводства не применяется.':''});
            else if(a.ownership!=='neighbor') {
                const r=measurementRect(o,true),known=a.purpose!=='unknown',house=a.purpose==='house';
                for(const [s,k] of Object.entries(sideKey)) {
                    const border=project.plot.borders[k],actual=r?(s==='right'?project.plot.width-r.right:s==='bottom'?project.plot.length-r.bottom:r[s]):null;
                    const missing=[];
                    if(a.ownership==='unknown')missing.push('Принадлежность объекта');
                    if(!known)missing.push('Назначение объекта');
                    if(!r)missing.push('Контур стены и выступы');
                    if(!border)missing.push('Соседство стороны');
                    if((border==='neighbor'||!border)&&!['open_parking','well','biotoilet'].includes(a.purpose)) {
                        check(house||!known?'B01':'B02',[o.id],actual,known?(house?3:a.purpose==='poultry'?4:1):null,missing,
                            {side:s,reason:'Отступ до границы соседнего участка.'});
                        if(!house&&known&&border==='neighbor'&&!['well','biotoilet','open_parking'].includes(a.purpose)) {
                            const hm=[...missing];if(a.height===null)hm.push('Высота стороны постройки');
                            check('B06',[o.id],actual,a.height===null?null:a.height/3,hm,{side:s,reason:'Высота не более трёх расстояний до границы.'});
                            if(actual!==null&&Math.abs(actual-1)<=g.geometryEpsilon)check('B06',[o.id],a.drainage==='own'?1:0,1,
                                a.drainage==='unknown'?['Направление стока с крыши']:[],{side:s,reason:'Сток не должен попадать к соседу.',metric:'condition'});
                        }
                    } else if(border==='road'&&!['open_parking','well','biotoilet'].includes(a.purpose)) {
                        if(context.lanes[k]==='unknown')missing.push('Полосность улицы/проезда');
                        if(context.localRoadMinimum===null)missing.push('Местный градостроительный отступ');
                        if(['garage','carport'].includes(a.purpose))missing.push('Условия примыкания к ограждению (исключение п. 6.6)');
                        check('B04',[o.id],actual,Math.max(context.lanes[k]==='one'?4:3,context.localRoadMinimum??0),missing,{side:s,
                            reason:['garage','carport'].includes(a.purpose)?'Общий отступ указан справочно: исключение для примыкания к ограждению пока не оценено.':'Граница участка со стороны УДС, не красная линия.'});
                    } else if(['forest','ditch'].includes(border))check('Z01',[o.id],null,null,[],{side:s});
                }
            }
            if(profile&&['well','outdoor_toilet','biotoilet'].includes(a.purpose))check('W01',[o.id]);
            for(const line of context.constraints)if(a.ownership!=='neighbor') {
                const m=g.rectangleSegmentMeasurement(g.objectRect(o),line);
                check('U01',[o.id],m.distance,line.minimum,[],{lineId:line.id,title:line.name,reason:'Порог задан пользователем.',start:m.start,end:m.end});
            }
        }
        for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++) {
            const a=placed[i],b=placed[j],aa=am.get(a.id),ba=am.get(b.id),ids=[a.id,b.id];
            const m=g.rectangleMeasurement(g.objectRect(a),g.objectRect(b));
            result.pairs.push({...m,objectIds:ids,required:null});
            if(aa.ownership==='neighbor'&&ba.ownership==='neighbor')continue;
            if(m.relation==='overlap')issue({kind:'overlap',objectIds:ids});
            if(m.relation==='touching')result.contacts++;
            if(aa.attachedTo===b.id||ba.attachedTo===a.id)check('A01',ids,m.relation==='touching'?1:0,1,[],
                {reason:'Объявленная пристройка должна касаться стены; перекрытие контуров остаётся ошибкой.',metric:'condition'});
            if(!profile)continue;
            const roles=[[a,b,aa,ba],[b,a,ba,aa]];
            function pair(ruleId,missing=[],extra={}) {
                const ar=measurementRect(a),br=measurementRect(b);
                if(!ar||!br)missing.push('Измеряемые контуры стен');
                if(aa.ownership==='unknown'||ba.ownership==='unknown')missing.push('Принадлежность объектов');
                const mm=ar&&br?g.rectangleMeasurement(ar,br):null;
                return check(ruleId,ids,mm?.distance??null,ruleDefinitions[ruleId].minimum,missing,
                    {start:mm?.start,end:mm?.end,reason:'Расстояние между подтверждёнными контурами стен.',...extra});
            }
            const hp=roles.find(([, ,h,t])=>h.purpose==='house'&&['bath','shower','outdoor_toilet'].includes(t.purpose));
            if(hp)pair('P01',hp[3].standalone==='unknown'?['Отдельно стоящее сооружение']:[],
                hp[3].standalone==='no'?{status:'not_applicable',reason:'Сооружение пристроено; правило для отдельно стоящих объектов не применено.'}:{});
            if(roles.some(([, ,w,t])=>w.purpose==='well'&&t.purpose==='outdoor_toilet'))pair('P02');
            for(const [h,t,ha,ta] of roles) {
                if(ha.purpose==='house'&&ta.purpose==='outdoor_toilet'&&
                    !(ha.ownership===ta.ownership&&ha.ownership!=='unknown')) {
                    if(context.sewer==='yes')check('P04',ids,null,null,[],{reason:'Централизованная канализация указана.'});
                    else pair('P04',context.sewer==='unknown'?['Наличие централизованной канализации']:[]);
                }
                if(ha.purpose==='house'&&ha.ownership==='own'&&ta.ownership==='neighbor') {
                    if(ha.windows===null)check('P03',ids,null,4,['Окна жилых помещений']);
                    else if(['house','outbuilding','poultry','garage','carport','open_parking','bath','shower','veranda','unknown'].includes(ta.purpose))for(const [index,w] of ha.windows.entries()) {
                        const p=windowPoint(h,w),r=measurementRect(t);
                        const mm=r?g.rectangleMeasurement({left:p.x,right:p.x,top:p.y,bottom:p.y},r):null;
                        check('P03',ids,mm?.distance??null,4,[...(r?[]:['Стена соседнего объекта']),...(ta.purpose==='unknown'?['Назначение соседнего объекта']:[])],{windowIndex:index,start:mm?.start,end:mm?.end,reason:'От окна жилого помещения до стены соседа.'});
                    }
                }
            }
            if(aa.purpose==='unknown'||ba.purpose==='unknown')check('P01',ids,null,null,['Назначение объектов']);
            if(aa.purpose==='house'||ba.purpose==='house') {
                if(aa.ownership==='unknown'||ba.ownership==='unknown')check('F01',ids,null,null,[],{status:'insufficient_data',missing:['Принадлежность объектов']});
                else if(aa.ownership!==ba.ownership)check('F01',ids);
            }
        }
        return result;
    }
    const api={evaluatePlacement,measurementRect};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(globalThis.YardMap ||= {},api);
})();
