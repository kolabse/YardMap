(() => {
    const definitions = {
        house: { name: 'Дом', color: 'rgba(66, 165, 245, 0.7)' },
        garage: { name: 'Гараж', color: 'rgba(169, 169, 169, 0.7)' },
        banya: { name: 'Баня', color: 'rgba(244, 67, 54, 0.7)' },
        shed: { name: 'Сарай', color: 'rgba(255, 193, 7, 0.7)' },
        toilet: { name: 'Туалет', color: 'rgba(233, 30, 99, 0.7)' },
        well: { name: 'Колодец', color: 'rgba(0, 188, 212, 0.7)' },
        borehole: { name: 'Скважина', color: 'rgba(0, 150, 136, 0.7)' },
        boiler: { name: 'Котельная', color: 'rgba(156, 39, 176, 0.7)' },
        gazebo: { name: 'Беседка', color: 'rgba(76, 175, 80, 0.7)' },
        veranda: { name: 'Веранда', color: 'rgba(205, 220, 57, 0.7)' },
        parking: { name: 'Парковка', color: 'rgba(96, 125, 139, 0.7)' }
    };
    Object.assign(definitions, {
        bed: {name:'Грядка',color:'rgba(141, 110, 99, 0.7)',category:'garden',shape:'rectangle',solid:false},
        greenhouse: {name:'Теплица',color:'rgba(38, 166, 154, 0.7)',category:'garden',shape:'rectangle',solid:true},
        tree: {name:'Дерево / кустарник',color:'rgba(67, 160, 71, 0.7)',category:'garden',shape:'circle',solid:false},
        path: {name:'Дорожка',color:'rgba(188, 170, 164, 0.7)',category:'routes',shape:'rectangle',solid:false},
        gate: {name:'Ворота',color:'rgba(120, 144, 156, 0.7)',category:'routes',shape:'line',solid:false},
        septic: {name:'Септик / система стоков',color:'rgba(92, 107, 192, 0.7)',category:'utilities',shape:'rectangle',solid:true},
        communication: {name:'Коммуникация',color:'rgba(255, 112, 67, 0.7)',category:'utilities',shape:'line',solid:false},
        compost: {name:'Компост',color:'rgba(109, 76, 65, 0.7)',category:'garden',shape:'rectangle',solid:true}
    });
    for(const d of Object.values(definitions)) {d.category??='buildings';d.shape??='rectangle';d.solid??=true;}
    const categoryLabels={buildings:'Постройки',garden:'Сад и огород',routes:'Дорожки и входы',utilities:'Инженерные системы'};
    const borderLabels = { road: 'Дорога', forest: 'Лес', neighbor: 'Сосед', ditch: 'Канава' };
    const api = { definitions, borderLabels, categoryLabels };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
