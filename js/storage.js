(() => {
    const files = typeof module !== 'undefined' && module.exports ? require('./project-file.js') : globalThis.YardMap;
    const variants = typeof module !== 'undefined' && module.exports ? require('./variants.js') : globalThis.YardMap;
    const projectStorageKey = 'yardmap.project.v1';
    function createProjectStore(getStorage) {
        return {
            load() {
                try {
                    const text = getStorage().getItem(projectStorageKey);
                    if (text === null) return { state: 'empty' };
                    const data = JSON.parse(text.replace(/^\uFEFF/,''));
                    const layouts = data && Object.hasOwn(data,'workspaceVersion')
                        ? variants.parseLayouts(text) : variants.createLayoutCollection(files.parseProject(text));
                    return { state: 'loaded', layouts, project: layouts.variants.find(item => item.id === layouts.activeId).project };
                } catch (error) { return { state: 'blocked', error: error.message }; }
            },
            save(layouts) {
                try {
                    const text = variants.serializeLayouts(layouts);
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
