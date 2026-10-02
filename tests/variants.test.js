const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../js/model.js');
const variants=require('../js/variants.js');
const {createProjectStore,projectStorageKey}=require('../js/storage.js');
// Characterization of the collection format after the controller cycle.
function fixture() {
    const project=model.createProject(); model.setPlot(project,20,35);
    return variants.createLayoutCollection(project);
}
test('collection validator rejects missing active variant, duplicate IDs, corrupt inactive project and counters',()=>{
    const mutations=[p=>p.workspaceVersion=2,p=>p.activeId='variant-99',p=>p.nextVariantId=1,
        p=>p.variants.push(p.variants[0]),p=>p.variants=[],
        p=>p.variants.push({id:'variant-2',project:{version:9}}),p=>p.variants[0].id='bad',
        p=>p.variants=Array.from({length:51},(_,i)=>({id:`variant-${i+1}`,project:model.createProject()}))];
    for(const mutate of mutations){const data=fixture(); mutate(data);assert.throws(()=>variants.serializeLayouts(data));}
});
test('collection round-trip retains active ID and every project independently',()=>{
    const data=fixture(); const copy=variants.cloneProject(data.variants[0].project);
    data.variants.push({id:'variant-2',project:copy}); data.activeId='variant-2';data.nextVariantId=3;
    const restored=variants.parseLayouts(variants.serializeLayouts(data));
    assert.deepEqual(restored,data); restored.variants[1].project.plot.borders.north='road';
    assert.equal(restored.variants[0].project.plot.borders.north,'');
});
test('store blocks a damaged inactive variant without writing partial recovery',()=>{
    const data=fixture();data.variants.push({id:'variant-2',project:{version:99}});
    const raw=JSON.stringify(data);let writes=0;
    const store=createProjectStore(()=>({getItem:key=>key===projectStorageKey?raw:null,setItem(){writes++;}}));
    assert.equal(store.load().state,'blocked');assert.equal(writes,0);
});
