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
    const borderLabels = { road: 'Дорога', forest: 'Лес', neighbor: 'Сосед', ditch: 'Канава' };
    const api = { definitions, borderLabels };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
