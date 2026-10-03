(() => {
    const engine = typeof module !== 'undefined' && module.exports ? require('./rule-engine.js') : globalThis.YardMap;
    function analyzePlacement(project) { return engine.evaluatePlacement(project); }
    const api = { analyzePlacement };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
