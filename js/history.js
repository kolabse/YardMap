(() => {
    function createHistory(limit = 100) {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Неверный предел истории');
        let current = null;
        const past = [], future = [];
        return {
            reset(project) { current = JSON.stringify(project); past.length = 0; future.length = 0; },
            record(project) {
                const next = JSON.stringify(project);
                if (next === current) return;
                if (current !== null) past.push(current);
                if (past.length > limit) past.shift();
                current = next; future.length = 0;
            },
            undo() {
                if (!past.length) return null;
                future.push(current); current = past.pop();
                return JSON.parse(current);
            },
            redo() {
                if (!future.length) return null;
                past.push(current); current = future.pop();
                return JSON.parse(current);
            },
            counts() { return { undo: past.length, redo: future.length }; }
        };
    }
    const api = { createHistory };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
