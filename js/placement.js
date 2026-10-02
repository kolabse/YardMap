(() => {
    const geometry = typeof module !== 'undefined' && module.exports ? require('./geometry.js') : globalThis.YardMap;
    const rules = typeof module !== 'undefined' && module.exports ? require('./rules.js') : globalThis.YardMap;

    // Checks the complete metre model; no selection, scale, DOM or hover state.
    function analyzePlacement(project) {
        const result = { checkedObjects: 0, issues: [], pairs: [], contacts: 0, invalidObjectIds: new Set() };
        if (!project.plot) return result;
        const placed = project.objects.filter(object => object.status === 'placed');
        result.checkedObjects = placed.length;
        const addIssue = issue => {
            result.issues.push(issue);
            issue.objectIds.forEach(id => result.invalidObjectIds.add(id));
        };
        for (const object of placed) {
            const distances = geometry.borderDistances(project.plot, object);
            const sides = Object.keys(distances).filter(side => distances[side] < -geometry.geometryEpsilon);
            if (sides.length) addIssue({ kind: 'outside', objectIds: [object.id], sides });
            const required = rules.requiredBorderDistance(object.type);
            for (const [side, actual] of Object.entries(distances)) {
                // A crossed side is already explained by the outside issue.
                if (actual >= -geometry.geometryEpsilon && actual + geometry.geometryEpsilon < required) {
                    addIssue({ kind: 'border-gap', objectIds: [object.id], side, actual: Math.max(0, actual), required });
                }
            }
        }
        for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
                const a = placed[i], b = placed[j];
                const measurement = geometry.rectangleMeasurement(geometry.objectRect(a), geometry.objectRect(b));
                const objectIds = [a.id, b.id];
                const required = rules.requiredObjectDistance(a.type, b.type);
                result.pairs.push({ ...measurement, objectIds, required });
                if (measurement.relation === 'overlap') {
                    addIssue({ kind: 'overlap', objectIds });
                } else {
                    if (measurement.relation === 'touching') result.contacts++;
                    if (measurement.distance + geometry.geometryEpsilon < required) {
                        addIssue({ kind: 'object-gap', objectIds, actual: measurement.distance, required });
                    }
                }
            }
        }
        return result;
    }
    const api = { analyzePlacement };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(globalThis.YardMap ||= {}, api);
})();
