const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');
const file = require('../js/project-file.js');

function fixture() {
    const project = model.createProject();
    model.setPlot(project,20,30);
    const object = model.addObject(project,'house',4,6);
    model.placeObject(project,object.id,2,3);
    return { project, object };
}

test('invalid object patches are atomic and cannot change identity or type', () => {
    const { project, object } = fixture();
    const before = structuredClone(object);
    for (const patch of [{ width:0,x:9 },{ rotation:45 },{ name:'' },{ x:Infinity },{ locked:'yes' }]) {
        assert.throws(()=>model.updateObject(project,object.id,patch));
        assert.deepEqual(object,before);
    }
    model.updateObject(project,object.id,{ id:'different',type:'shed',name:'Дом' });
    assert.equal(object.id,before.id);
    assert.equal(object.type,'house');
});

test('position locking protects coordinates, orientation and placement but permits dimensions', () => {
    const { project, object } = fixture();
    model.updateObject(project,object.id,{ locked:true });
    for (const patch of [{ x:5 },{ y:7 },{ rotation:90 },{ status:'waiting' }]) {
        assert.throws(()=>model.updateObject(project,object.id,patch));
    }
    assert.throws(()=>model.returnToWaiting(project,object.id));
    assert.throws(()=>model.placeObject(project,object.id,8,9));
    model.updateObject(project,object.id,{ name:'Закреплённый дом',width:5 });
    assert.equal(object.width,5);
    assert.equal(object.x,2);
});

test('copies have independent waiting geometry and deleted IDs are never reused', () => {
    const { project, object } = fixture();
    model.updateObject(project,object.id,{ rotation:90,locked:true });
    const copy = model.copyObject(project,object.id);
    assert.equal(copy.rotation,90);
    assert.equal(copy.locked,false);
    assert.equal(copy.status,'waiting');
    assert.equal(copy.x,null);
    model.updateObject(project,copy.id,{ width:9 });
    assert.equal(object.width,4);
    model.deleteObject(project,copy.id);
    assert.equal(model.addObject(project,'shed',2,2).id,'object-3');
});

test('legacy version one files default to unlocked and invalid locks are rejected', () => {
    const { project, object } = fixture();
    delete object.locked;
    assert.equal(file.parseProject(JSON.stringify(project)).objects[0].locked,false);
    for (const value of [null,1,'false']) {
        object.locked=value;
        assert.throws(()=>file.parseProject(JSON.stringify(project)));
    }
    object.locked=true;
    assert.equal(file.parseProject(file.serializeProject(project)).objects[0].locked,true);
});
