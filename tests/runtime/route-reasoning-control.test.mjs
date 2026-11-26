import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';

async function fixture(t) {
  const root = path.resolve('.tmp/codex-routing-range-20261126');
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'control-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  await store.update(config => ({ ...config, upstreams: [{ id: 'a', enabled: true }, { id: 'b', enabled: true }] }));
  const control = createControlServer({ store, vault: {}, controlToken: 'control-test' });
  await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
  t.after(() => { control.closeAllConnections(); control.close(); });
  return { store, async request(endpoint, value, method = 'POST') {
    const response = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/${endpoint}`, { method, headers: { authorization: 'Bearer control-test', 'content-type': 'application/json' }, body: JSON.stringify(value) });
    return { status: response.status, body: await response.json() };
  } };
}

const batch = extras => ({ inboundProtocol: 'Res', outboundProtocol: 'Chat', targets: [{ upstreamId: 'a', modelId: 'one' }, { upstreamId: 'a', modelId: 'two' }], ...extras });

test('batch persists distinct per-model ranges, omission retains them, and clear deletes only the selected policy', async t => {
  const app = await fixture(t);
  const saved = await app.request('routes/batch', batch({ modelReasoning: [{ modelId: 'one', min: 'low', max: 'high' }, { modelId: 'two', min: 'max', max: 'max' }] }));
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.routes.map(route => route.reasoning), [{ min: 'low', max: 'high' }, { min: 'max', max: 'max' }]);
  assert.equal((await app.request('routes/batch', batch())).status, 200);
  assert.deepEqual((await app.store.read()).routes.map(route => route.reasoning), [{ min: 'low', max: 'high' }, { min: 'max', max: 'max' }]);
  const cleared = await app.request('routes/batch', batch({ modelReasoning: [{ modelId: 'one', clear: true }] }));
  assert.equal(cleared.status, 200);
  assert.equal(Object.hasOwn(cleared.body.routes[0], 'reasoning'), false);
  assert.deepEqual(cleared.body.routes[1].reasoning, { min: 'max', max: 'max' });
  assert.deepEqual((await new ConfigStore(app.store.filePath).read()).routes, cleared.body.routes);
});

test('invalid batch ranges reject atomically before changing any route', async t => {
  const app = await fixture(t);
  await app.request('routes/batch', batch());
  const before = await fs.readFile(app.store.filePath, 'utf8');
  const invalid = [
    null, {},
    [{ modelId: 'unknown', min: 'low', max: 'high' }],
    [{ modelId: 'one', min: 'low', max: 'high' }, { modelId: 'one', clear: true }],
    [{ modelId: 'one', min: 'high', max: 'low' }],
    [{ modelId: 'one', min: 'persistent', max: 'max' }],
    [{ modelId: 'one', min: 'none', max: 'ultra' }],
    [{ modelId: 'one', min: 'ultra', max: 'ultra' }],
    [{ modelId: 'one', min: 'low', max: 'made-up' }],
    [{ modelId: 'one', min: null, max: 'high' }],
    [{ modelId: 'one', clear: true, min: 'low', max: 'high' }],
    [{ modelId: 'one', clear: false }],
    [null],
    [{ modelId: 'two', min: 'low', max: 'high' }, { modelId: 'one', min: 'high', max: 'low' }],
  ];
  for (const modelReasoning of invalid) {
    const result = await app.request('routes/batch', batch({ modelReasoning }));
    assert.equal(result.status, 400, JSON.stringify(modelReasoning));
    assert.equal(await fs.readFile(app.store.filePath, 'utf8'), before, JSON.stringify(modelReasoning));
  }
});

test('single-route creation and patch validate ranges, preserve omissions, and remove null policies', async t => {
  const app = await fixture(t);
  const input = { alias: 'custom', inboundProtocol: 'Res', outboundProtocol: 'Mes', upstreamId: 'a', modelId: 'one', enabled: false, reasoning: { min: 'minimal', max: 'xhigh' } };
  const created = await app.request('routes', input);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.reasoning, input.reasoning);
  const endpoint = `routes/${created.body.id}`;
  assert.deepEqual((await app.request(endpoint, { alias: 'custom-2' }, 'PATCH')).body.reasoning, input.reasoning);
  const before = await fs.readFile(app.store.filePath, 'utf8');
  for (const reasoning of [{ min: 'high', max: 'low' }, { min: 'persistent', max: 'max' }, { min: 'none', max: 'ultra' }, { min: 'ultra', max: 'ultra' }, {}, [], false]) {
    assert.equal((await app.request(endpoint, { reasoning }, 'PATCH')).status, 400);
    assert.equal(await fs.readFile(app.store.filePath, 'utf8'), before);
    assert.equal((await app.request('routes', { ...input, alias: 'other', reasoning })).status, 400);
  }
  const cleared = await app.request(endpoint, { reasoning: null }, 'PATCH');
  assert.equal(cleared.status, 200);
  assert.equal(Object.hasOwn(cleared.body, 'reasoning'), false);
  for (const [index, level] of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].entries()) {
    assert.equal((await app.request('routes', { ...input, alias: `level-${index}`, reasoning: { min: level, max: level } })).status, 201);
  }
});

test('explicit target replacement removes stale targets while legacy merging and edit identity stay compatible', async t => {
  const app = await fixture(t);
  const initial = batch({ targets: [{ upstreamId: 'a', modelId: 'one' }, { upstreamId: 'b', modelId: 'one' }], modelReasoning: [{ modelId: 'one', min: 'low', max: 'high' }] });
  const saved = await app.request('routes/batch', initial);
  await app.request('routes/batch', { ...initial, targets: initial.targets.slice(0, 1), modelReasoning: undefined });
  assert.deepEqual((await app.store.read()).routes[0].targets, initial.targets);
  const replace = await app.request('routes/batch', { ...initial, replaceTargets: true, targets: initial.targets.slice(1), modelReasoning: undefined });
  assert.equal(replace.status, 200);
  assert.deepEqual(replace.body.routes[0].targets, [{ upstreamId: 'b', modelId: 'one' }]);
  await app.request(`routes/${saved.body.routes[0].id}`, { alias: 'my-alias', enabled: false }, 'PATCH');
  const edited = await app.request('routes/batch', { ...initial, editId: saved.body.routes[0].id, targets: [{ upstreamId: 'b', modelId: 'one' }, { upstreamId: 'a', modelId: 'one' }], modelReasoning: undefined, failover: { failureThreshold: 7, statusClasses: [5] } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.routes[0].id, saved.body.routes[0].id);
  assert.equal(edited.body.routes[0].alias, 'my-alias');
  assert.equal(edited.body.routes[0].enabled, false);
  assert.deepEqual(edited.body.routes[0].targets, [{ upstreamId: 'b', modelId: 'one' }, { upstreamId: 'a', modelId: 'one' }]);
  assert.deepEqual(edited.body.routes[0].reasoning, { min: 'low', max: 'high' });
  assert.deepEqual(edited.body.routes[0].failover, { failureThreshold: 7, statusClasses: [5], cooldownSeconds: 60 });
});

test('batch rejects malformed replacement flags instead of silently retaining hidden targets', async t => {
  const app = await fixture(t);
  const before = await fs.readFile(app.store.filePath, 'utf8');
  for (const replaceTargets of ['true', 1, null, {}]) {
    assert.equal((await app.request('routes/batch', batch({ replaceTargets }))).status, 400);
    assert.equal(await fs.readFile(app.store.filePath, 'utf8'), before);
  }
});

for (const models of [['one', 'two'], ['two', 'one'], ['three', 'one', 'two']]) {
  test(`batch rejects active alias collisions within the saved set atomically (${models.join(', ')})`, async t => {
    const app = await fixture(t);
    const original = { id: 'edit', alias: 'two', modelId: 'one', enabled: true, inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'a', reasoning: { min: 'low', max: 'high' } };
    await app.store.update(config => ({ ...config, routes: [original] }));
    const before = await fs.readFile(app.store.filePath, 'utf8');
    const result = await app.request('routes/batch', batch({
      editId: 'edit', replaceTargets: true,
      targets: models.flatMap(modelId => [{ upstreamId: 'b', modelId }, { upstreamId: 'a', modelId }]),
      modelReasoning: models.map(modelId => modelId === 'one' ? { modelId, min: 'low', max: 'high' } : { modelId, min: 'max', max: 'max' }),
    }));
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'route_conflict');
    assert.equal(await fs.readFile(app.store.filePath, 'utf8'), before);
    assert.deepEqual((await app.store.read()).routes, [original]);
  });
}

for (const models of [['one', 'two', 'three'], ['two', 'three', 'one']]) {
  test(`batch preserves disabled identity while adding an active model with its alias (${models.join(', ')})`, async t => {
    const app = await fixture(t);
    await app.store.update(config => ({ ...config, routes: [{ id: 'edit', alias: 'two', modelId: 'one', enabled: false, inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'a', reasoning: { min: 'low', max: 'high' } }] }));
    const result = await app.request('routes/batch', batch({ editId: 'edit', replaceTargets: true, targets: models.map(modelId => ({ upstreamId: 'b', modelId })), modelReasoning: [{ modelId: 'two', min: 'max', max: 'max' }] }));
    assert.equal(result.status, 200);
    const routes = (await app.store.read()).routes;
    assert.equal(routes.length, 3);
    assert.deepEqual(routes.filter(route => route.enabled).map(route => route.alias).sort(), ['three', 'two']);
    assert.deepEqual(routes.find(route => route.id === 'edit').reasoning, { min: 'low', max: 'high' });
    assert.equal(routes.find(route => route.id === 'edit').enabled, false);
    assert.deepEqual(routes.find(route => route.modelId === 'two').reasoning, { min: 'max', max: 'max' });
  });
}

test('batch permits the same alias on a disabled retained route or a different inbound protocol', async t => {
  const app = await fixture(t);
  const retained = [
    { id: 'disabled', alias: 'two', modelId: 'archived', enabled: false, inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'a' },
    { id: 'chat', alias: 'two', modelId: 'chat-model', enabled: true, inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'a' },
  ];
  await app.store.update(config => ({ ...config, routes: retained }));
  const result = await app.request('routes/batch', batch({ replaceTargets: true }));
  assert.equal(result.status, 200);
  const routes = (await app.store.read()).routes;
  assert.deepEqual(routes.slice(0, 2), retained);
  assert.deepEqual(routes.filter(route => route.enabled && route.inboundProtocol === 'Res').map(route => route.alias), ['one', 'two']);
});
