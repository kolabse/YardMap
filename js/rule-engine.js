(() => {
    const g=typeof module!=='undefined'&&module.exports?require('./geometry.js'):globalThis.YardMap;
    const {ruleDefinitions}=typeof module!=='undefined'&&module.exports?require('./rules.js'):globalThis.YardMap;
    const {definitions}=typeof module!=='undefined'&&module.exports?require('./catalog.js'):globalThis.YardMap;
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
            if(c.status==='violation')issue({...c,kind:extra.side||extra.edgeId?'border-gap':'object-gap'});
            return c;
        }
        function polygonChecks(o,a) {
            const wall=measurementRect(o,true),simpleWall=measurementRect(o);
            const edges=g.boundaryMeasurements(project.plot,o,wall,o.type==='tree');
            const baseMissing=[];if(a.ownership==='unknown')baseMissing.push('Принадлежность объекта');
            const inside=g.isInsidePlot(project.plot,o);
            for(const e of edges) {
                const extra={edgeId:e.id,edgeLabel:e.label,start:e.start,end:e.end};
                const missing=[...baseMissing];if(!inside)missing.push('Объект должен находиться внутри контура');
                if(['forest','ditch'].includes(e.border))check('Z01',[o.id],null,null,[],extra);
                if(o.type==='tree') {
                    if(e.border==='neighbor'||!e.border) {
                        const minimum={high:4,medium:2,low:1}[a.treeClass];
                        if(!minimum)missing.push('Категория взрослого растения');if(!e.border)missing.push('Соседство стороны');
                        check('B03',[o.id],e.actual,minimum??null,missing,{...extra,reason:'Расстояние от ствола до конечной стороны контура.'});
                    }
                }else if(o.type==='compost') {
                    if(a.purpose!=='compost')missing.push('Назначение компостного сооружения');
                    if(e.border==='road')check('S01',[o.id],null,2,[...missing,'Подтверждённое ограждение улицы / проезда'],extra);
                    else if(e.border==='neighbor'||!e.border){if(!e.border)missing.push('Соседство стороны');check('S01',[o.id],e.actual,2,missing,extra);}
                }else if(o.type==='septic') {
                    const kind=a.septicKind??'unknown';if(kind==='unknown')missing.push('Тип и состав стоков');
                    if(a.purpose!=='septic')missing.push('Назначение системы стоков');if(!simpleWall)missing.push('Контур сооружения');
                    if(kind==='septic'||e.border==='neighbor'||!e.border) {
                        if(!e.border&&kind!=='septic')missing.push('Соседство стороны');
                        const m=g.boundaryMeasurements(project.plot,o,simpleWall).find(m=>m.id===e.id);
                        check('S02',[o.id],simpleWall?m.actual:null,kind==='septic'?1:2,missing,{...extra,start:m.start,end:m.end});
                    }
                    if(kind==='pit'&&e.border==='road')check('S02',[o.id],null,2,[...missing,'Подтверждённое ограждение улицы / проезда'],extra);
                }else if(definitions[o.type].solid) {
                    if(a.purpose==='unknown')missing.push('Назначение объекта');if(!wall)missing.push('Контур стены и выступы');if(!e.border)missing.push('Соседство стороны');
                    const actual=wall?e.actual:null,known=a.purpose!=='unknown',house=a.purpose==='house';
                    if((e.border==='neighbor'||!e.border)&&!['well','biotoilet','open_parking'].includes(a.purpose)) {
                        check(house||!known?'B01':'B02',[o.id],actual,known?(house?3:a.purpose==='poultry'?4:1):null,missing,extra);
                        if(known&&!house&&e.border==='neighbor') {
                            check('B06',[o.id],actual,a.height===null?null:a.height/3,a.height===null?[...missing,'Высота стороны постройки']:missing,extra);
                            if(actual!==null&&Math.abs(actual-1)<=g.geometryEpsilon)check('B06',[o.id],a.drainage==='own'?1:0,1,a.drainage==='unknown'?[...missing,'Направление стока с крыши']:missing,{...extra,metric:'condition',start:undefined,end:undefined});
                        }
                    }else if(e.border==='road'&&!['well','biotoilet','open_parking'].includes(a.purpose)) {
                        if(e.lanes==='unknown')missing.push('Полосность улицы / проезда');if(context.localRoadMinimum===null)missing.push('Местный градостроительный отступ');
                        if(['garage','carport'].includes(a.purpose))missing.push('Условия примыкания к ограждению');
                        check('B04',[o.id],actual,Math.max(e.lanes==='one'?4:3,context.localRoadMinimum??0),missing,{...extra,reason:'Граница участка со стороны УДС, не красная линия.'});
                    }
                }
            }
        }
        const profile=context.territory==='gardening';
        for(const o of placed) {
            const a=am.get(o.id);
            if(a.ownership!=='neighbor') {
                const d=g.borderDistances(project.plot,o),sides=o.type==='tree'?['left','right','top','bottom'].filter(s=>({left:o.x,right:project.plot.width-o.x,top:o.y,bottom:project.plot.length-o.y})[s]<-g.geometryEpsilon):Object.keys(d).filter(s=>d[s]<-g.geometryEpsilon);
                if(project.plot.kind==='polygon'?!g.isInsidePlot(project.plot,o):sides.length)issue({kind:'outside',objectIds:[o.id],sides:project.plot.kind==='polygon'?[]:sides});
            }
            if(!profile)check('PROFILE',[o.id],null,null,context.territory==='unknown'?['Назначение территории']:[],
                {reason:context.territory==='other'?'Профиль садоводства не применяется.':''});
            else if(project.plot.kind==='polygon'&&a.ownership!=='neighbor')polygonChecks(o,a);
            else if(a.ownership!=='neighbor'&&['tree','septic','compost'].includes(o.type)) {
                for(const [s,k] of Object.entries(sideKey)) {
                    const border=project.plot.borders[k];
                    const missing=a.ownership==='unknown'?['Принадлежность объекта']:[];
                    if(!border)missing.push('Соседство стороны');
                    if(['forest','ditch'].includes(border))check('Z01',[o.id],null,null,[],{side:s});
                    if(o.type==='tree'&&(border==='neighbor'||!border)) {
                        const required={high:4,medium:2,low:1}[a.treeClass];
                        if(!required)missing.push('Категория взрослого дерева / кустарника');
                        check('B03',[o.id],{left:o.x,right:project.plot.width-o.x,top:o.y,bottom:project.plot.length-o.y}[s],required??null,missing,{side:s,start:{x:o.x,y:o.y},end:{left:{x:0,y:o.y},right:{x:project.plot.width,y:o.y},top:{x:o.x,y:0},bottom:{x:o.x,y:project.plot.length}}[s],reason:'Измеряется от ствола, не от края кроны. Категорию взрослого растения подтверждает пользователь.'});
                    }
                    if(o.type==='compost'&&(border==='neighbor'||!border)) {
                        if(a.purpose!=='compost')missing.push('Назначение компостного сооружения');
                        check('S01',[o.id],g.borderDistances(project.plot,o)[s],2,missing,{side:s});
                    }
                    if(o.type==='compost'&&border==='road')check('S01',[o.id],null,2,[...missing,'Подтверждённое ограждение улицы / проезда'],{side:s});
                    if(o.type==='septic') {
                        const kind=a.septicKind??'unknown',r=measurementRect(o);
                        if(kind==='unknown')missing.push('Тип и состав стоков');
                        if(a.purpose!=='septic')missing.push('Назначение системы стоков');
                        if(!r)missing.push('Контур сооружения');
                        if(kind==='septic'||border==='neighbor'||!border)check('S02',[o.id],r?g.borderDistances(project.plot,o)[s]:null,kind==='septic'?1:2,kind==='septic'?missing.filter(v=>v!=='Соседство стороны'):missing,{side:s,reason:'Проверяется только указанное граничное условие; санитарные требования до воды и домов не сверены.'});
                        if(kind==='pit'&&border==='road')check('S02',[o.id],null,2,[...missing,'Подтверждённое ограждение улицы / проезда'],{side:s});
                    }
                }
            }
            else if(a.ownership!=='neighbor'&&definitions[o.type].solid) {
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
            if(profile&&(['well','outdoor_toilet','biotoilet','septic'].includes(a.purpose)||o.type==='septic'))check('W01',[o.id]);
            if(project.plot.kind==='polygon'&&a.ownership!=='neighbor')for(const e of g.boundaryMeasurements(project.plot,o))if(e.minimum!==null)check('U02',[o.id],e.actual,e.minimum,[],{edgeId:e.id,edgeLabel:e.label,start:e.start,end:e.end,reason:'Порог этой стороны задан пользователем.'});
            for(const line of context.constraints)if(a.ownership!=='neighbor') {
                const proxy={geometry:{kind:'line',dx:line.x2-line.x1,dy:line.y2-line.y1},x:line.x1,y:line.y1,rotation:0};
                const m=g.objectMeasurement(o,proxy);
                check('U01',[o.id],m.distance,line.minimum,[],{lineId:line.id,title:line.name,reason:'Порог задан пользователем.',start:m.start,end:m.end});
            }
        }
        for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++) {
            const a=placed[i],b=placed[j],aa=am.get(a.id),ba=am.get(b.id),ids=[a.id,b.id];
            const m=g.objectMeasurement(a,b);
            result.pairs.push({...m,relation:m.relation==='overlap'&&!(definitions[a.type].solid&&definitions[b.type].solid)?'allowed-overlay':m.relation,objectIds:ids,required:null});
            if(aa.ownership==='neighbor'&&ba.ownership==='neighbor')continue;
            if(m.relation==='overlap'&&definitions[a.type].solid&&definitions[b.type].solid)issue({kind:'overlap',objectIds:ids});
            if(m.relation==='touching')result.contacts++;
            if(aa.attachedTo===b.id||ba.attachedTo===a.id)check('A01',ids,m.relation==='touching'?1:0,1,[],
                {reason:'Объявленная пристройка должна касаться стены; перекрытие контуров остаётся ошибкой.',metric:'condition'});
            if(!profile||a.geometry||b.geometry||!definitions[a.type].solid||!definitions[b.type].solid)continue;
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
            if(roles.some(([, ,w,t])=>w.purpose==='well'&&['outdoor_toilet','compost'].includes(t.purpose)))pair('P02');
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
