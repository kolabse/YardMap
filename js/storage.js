(() => {
    const files = typeof module !== 'undefined' && module.exports ? require('./project-file.js') : globalThis.YardMap;
    const projectStorageKey = 'yardmap.project.v1';
    function createProjectStore(getStorage) {
        return {
            load() {
                try {
                    const text = getStorage().getItem(projectStorageKey);
                    return text === null ? { state: 'empty' } : { state: 'loaded', project: files.parseProject(text) };
                } catch (error) { return { state: 'blocked', error: error.message }; }
            },
            save(project) {
                try {
                    const text = files.serializeProject(project);
                    getStorage().setItem(projectStorageKey,text);
                    return { ok: true };
                } catch (error) { return { ok: false, error: error.message }; }
            }
        };
    }
    const api = { projectStorageKey, createProjectStore };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {},api);
})();
