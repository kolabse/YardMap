(() => {
    // Legacy thresholds preserved during YM-001; source verification is YM-011.
    function requiredBorderDistance(type) {
        if (type === 'house') return 3;
        if (type === 'toilet' || type === 'well') return 8;
        return 1;
    }
    function requiredObjectDistance(type1, type2) {
        if (type1 === 'parking' || type2 === 'parking') return 0;
        if (type1 === 'house' || type2 === 'house') {
            if (['toilet', 'banya', 'well'].includes(type1) || ['toilet', 'banya', 'well'].includes(type2)) return 8;
            return 3;
        }
        if (type1 === 'toilet' || type2 === 'toilet') {
            if (type1 === 'well' || type2 === 'well') return 12;
            return 8;
        }
        return 1;
    }
    const api = { requiredBorderDistance, requiredObjectDistance };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
