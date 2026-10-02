const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const model = require('../js/model.js');
const api = fs.existsSync(require.resolve('../js/model.js').replace('model.js','project-file.js'))
    ? require('../js/project-file.js') : {};
function fixture() {
    const project = model.createProject();
    project.name = 'Сад у озера'; project.settings = { units: 'm' };
    model.setPlot(project,20.5,35.75); model.setBorder(project,'north','road');
    const a = model.addObject(project,'house',5.25,6.5);
    model.placeObject(project,a.id,-1.25,4.125); a.rotation=90; a.name='Наш дом';
    model.addObject(project,'parking',2,3);
    return project;
}
test('project JSON round-trips names, borders, rotated metre geometry and waiting objects', () => {
    assert.equal(typeof api.serializeProject,'function','JSON export is available');
    const project=fixture(), restored=api.parseProject(api.serializeProject(project));
    assert.deepEqual(restored,project);
    assert.equal(model.addObject(restored,'shed',2,2).id,'object-3');
});
test('project JSON rejects invalid types, dimensions, coordinates, IDs and versions', () => {
    assert.equal(typeof api.parseProject,'function','JSON validation is available');
    const mutations = [p=>p.version=2,p=>p.plot.width=0,p=>p.plot.length='35',
        p=>p.plot.borders.north='unknown',p=>p.objects[0].type='toString',
        p=>p.objects[0].width=-1,p=>p.objects[0].x=null,p=>p.objects[0].rotation=45,
        p=>p.objects[1].id=p.objects[0].id,p=>p.objects[1].x=3,
        p=>p.nextObjectId=2,p=>p.nextObjectId=1.5,p=>p.settings.units='px',
        p=>p.name='',p=>p.objects={},p=>p.plot=null];
    for(const mutate of mutations) {
        const project=fixture(); mutate(project);
        assert.throws(()=>api.parseProject(JSON.stringify(project)),Error);
    }
    for(const text of ['{','null','[]','{"version":1}', '{"version":1,"plot":{"width":1e999}}']) {
        assert.throws(()=>api.parseProject(text),Error);
    }
});
test('project JSON exports only portable fields without mutating source data', () => {
    assert.equal(typeof api.serializeProject,'function','portable export is available');
    const project=fixture(); project.selectedId='object-1'; project.objects[0].screenX=200;
    project.objects[0].element={ self:null }; project.objects[0].element.self=project.objects[0].element;
    const restored=api.parseProject(api.serializeProject(project));
    assert.equal(Object.hasOwn(restored,'selectedId'),false);
    assert.equal(Object.hasOwn(restored.objects[0],'element'),false);
    assert.equal(Object.hasOwn(restored.objects[0],'screenX'),false);
    assert.equal(project.objects[0].screenX,200);
});
test('project JSON permits empty projects and rejects nonfinite numeric source data', () => {
    assert.equal(typeof api.serializeProject,'function','empty-project export is available');
    assert.deepEqual(api.parseProject(api.serializeProject(model.createProject())),model.createProject());
    const project=fixture(); project.objects[0].x=Infinity;
    assert.throws(()=>api.serializeProject(project),Error);
});
