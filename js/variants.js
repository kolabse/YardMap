(() => {
    const files = typeof module !== 'undefined' && module.exports ? require('./project-file.js') : globalThis.YardMap;
    const maxVariants = 50;
    function cloneProject(project) { return files.parseProject(files.serializeProject(project)); }
    function createLayoutCollection(project) {
        return { workspaceVersion: 1, activeId: 'variant-1', nextVariantId: 2, variants: [{ id: 'variant-1', project }] };
    }
    function normalizeLayouts(data) {
        if (!data || data.workspaceVersion !== 1) throw new Error('Неподдерживаемая версия списка вариантов.');
        if (!Array.isArray(data.variants) || !data.variants.length || data.variants.length > maxVariants) throw new Error('В списке должно быть от 1 до 50 вариантов.');
        const ids = new Set(); let largest = 0;
        const variants = data.variants.map(item => {
            const match = typeof item?.id === 'string' && /^variant-([1-9]\d*)$/.exec(item.id);
            if (!match || ids.has(item.id) || !Number.isSafeInteger(Number(match[1]))) throw new Error('Неверный или повторяющийся ID варианта.');
            ids.add(item.id); largest = Math.max(largest,Number(match[1]));
            return { id: item.id, project: cloneProject(item.project) };
        });
        if (!ids.has(data.activeId)) throw new Error('Активный вариант не найден.');
        if (!Number.isSafeInteger(data.nextVariantId) || data.nextVariantId <= largest || data.nextVariantId >= Number.MAX_SAFE_INTEGER) throw new Error('Неверный счётчик вариантов.');
        return { workspaceVersion: 1, activeId: data.activeId, nextVariantId: data.nextVariantId, variants };
    }
    function serializeLayouts(layouts) { return JSON.stringify(normalizeLayouts(layouts)); }
    function parseLayouts(text) { return normalizeLayouts(JSON.parse(text.replace(/^\uFEFF/,''))); }
    const api = { cloneProject, createLayoutCollection, serializeLayouts, parseLayouts, maxVariants };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {},api);
})();
