(() => {
    const source={document:'СП 53.13330.2019, изменение №1',revision:'17.02.2023',checkedAt:'2026-10-03',
        url:'https://api.faufcc.ru/api/assets/a9c9b244-e64e-472e-9bf3-f5c8b43a4962',amendmentUrl:'https://minstroyrf.gov.ru/upload/iblock/11d/Izm1-k-SP-53.pdf'};
    const ruleDefinitions={
        PROFILE:{title:'Область применения',clause:'1'},
        B01:{title:'Дом до соседней границы',clause:'6.7',minimum:3},
        B02:{title:'Хозпостройка до соседней границы',clause:'6.7'},
        B04:{title:'Отступ со стороны улицы/проезда',clause:'6.6'},
        B06:{title:'Высота и сток к соседней границе',clause:'6.7'},
        P01:{title:'Дом до душа, отдельной бани или надворного туалета',clause:'6.8',minimum:8},
        P02:{title:'Колодец до надворного туалета',clause:'6.8',minimum:8},
        P03:{title:'Окно жилого помещения до соседней стены',clause:'6.8',minimum:4},
        P04:{title:'Надворный туалет до соседнего дома без центральной канализации',clause:'6.8',minimum:12},
        A01:{title:'Соединение пристройки',category:'geometry',clause:'6.9'},
        F01:{title:'Противопожарные расстояния',clause:'4.3–4.13, таблица 1',sourceStatus:'pending',
            source:{document:'СП 4.13130.2013, изменения №1–4',checkedAt:'2026-10-03',url:'https://protect.gost.ru/sp/details/fe915813-95ec-43a6-ab1c-91027e06bf1c'}},
        W01:{title:'Санитарные условия водоснабжения и канализации',clause:'8.1–8.3, 8.7',sourceStatus:'pending'},
        Z01:{title:'Лес, канава и специальные зоны',clause:'4',sourceStatus:'pending'},
        U01:{title:'Пользовательский отступ от линии',category:'user',source:null}
    };
    for(const [id,r] of Object.entries(ruleDefinitions))ruleDefinitions[id]=Object.freeze({id,category:'document',sourceStatus:'verified',source,...r});
    Object.freeze(ruleDefinitions);
    const api={ruleSetVersion:1,ruleDefinitions};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
