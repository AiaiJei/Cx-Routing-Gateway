import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  return { response, body: await response.json() };
}

test('control API manages upstreams, routes, and one-time client key creation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-control-'));
  const server = createControlServer({
    store: new ConfigStore(path.join(dir, 'config.json')),
    vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key'), allowUnauthenticated: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const upstream = await jsonRequest(`${base}/v1/control/upstreams`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Mock', baseUrl: 'http://127.0.0.1:4321', protocol: 'Chat', apiKey: 'upstream-secret', allowPrivateNetwork: true }),
  });
  assert.equal(upstream.response.status, 201);
  assert.equal(upstream.body.apiKey, undefined);
  assert.equal(upstream.body.credentialRef.length > 0, true);
  assert.equal(upstream.body.providerId, 'openai');
  assert.equal(upstream.body.apiProfile, 'openai-chat-completions-v1');

  const route = await jsonRequest(`${base}/v1/control/routes`, {
    method: 'POST',
    body: JSON.stringify({ alias: 'demo', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: upstream.body.id, modelId: 'mock-model' }),
  });
  assert.equal(route.response.status, 201);
  const conflict = await jsonRequest(`${base}/v1/control/routes`, { method: 'POST', body: JSON.stringify({ alias: 'demo', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: upstream.body.id, modelId: 'other-model' }) });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error, 'route_conflict');

  const key = await jsonRequest(`${base}/v1/control/client-keys`, { method: 'POST', body: JSON.stringify({ name: 'test-client', scope: ['demo'] }) });
  assert.equal(key.response.status, 201);
  assert.match(key.body.key, /^cxrg_/);
  assert.deepEqual(key.body.scope, ['demo']);
  const state = await jsonRequest(`${base}/v1/control/state`);
  assert.equal(state.body.upstreams[0].credentialRef, upstream.body.credentialRef);
  assert.equal(state.body.clientKeys[0].key, undefined);

  const update = await jsonRequest(`${base}/v1/control/upstreams/${upstream.body.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Mock updated', enabled: false }) });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.name, 'Mock updated');
  const revoke = await jsonRequest(`${base}/v1/control/client-keys/${key.body.id}`, { method: 'DELETE' });
  assert.equal(revoke.response.status, 200);
  const replacement = await jsonRequest(`${base}/v1/control/client-keys/${key.body.id}/rotate`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(replacement.response.status, 200);
  assert.match(replacement.body.key, /^cxrg_/);
  assert.notEqual(replacement.body.key, key.body.key);
  const routeUpdate = await jsonRequest(`${base}/v1/control/routes/${route.body.id}`, { method: 'PATCH', body: JSON.stringify({ alias: 'demo-updated', enabled: false }) });
  assert.equal(routeUpdate.response.status, 200);
  assert.equal(routeUpdate.body.alias, 'demo-updated');
  const removed = await jsonRequest(`${base}/v1/control/routes/${route.body.id}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
});

test('control API runs a bounded upstream connectivity and model discovery check', async (t) => {
  const mock = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'model-a' }] }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  t.after(() => mock.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-discovery-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const server = createControlServer({ store, vault, allowUnauthenticated: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const upstream = await jsonRequest(`${base}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Discovery', baseUrl: `http://127.0.0.1:${mock.address().port}`, protocol: 'Chat', allowPrivateNetwork: true }) });
  const result = await jsonRequest(`${base}/v1/control/upstreams/${upstream.body.id}/test`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(result.body.models, ['model-a']);
  const state = await jsonRequest(`${base}/v1/control/state`);
  assert.deepEqual(state.body.upstreams[0].models, ['model-a']);
});

test('control API pins model discovery to the approved DNS address', async (t) => {
  const mock = http.createServer((req, res) => {
    assert.match(req.headers.host, /^discovery\.test:/);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'pinned-model' }] }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  t.after(() => mock.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-discovery-pinned-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const server = createControlServer({ store, vault, allowUnauthenticated: true, dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const upstream = await jsonRequest(`${base}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Pinned', baseUrl: `http://discovery.test:${mock.address().port}`, protocol: 'Chat', allowPrivateNetwork: true }) });
  assert.equal(upstream.response.status, 201);
  const result = await jsonRequest(`${base}/v1/control/upstreams/${upstream.body.id}/test`, { method: 'POST', body: '{}' });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.models, ['pinned-model']);
});

test('control API rejects mixed public and private DNS answers', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-mixed-dns-'));
  const server = createControlServer({ store: new ConfigStore(path.join(dir, 'config.json')), vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key'), allowUnauthenticated: true, dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }, { address: '8.8.8.8', family: 4 }] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await jsonRequest(`${base}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Mixed', baseUrl: 'http://mixed.test:1', protocol: 'Chat', allowPrivateNetwork: true }) });
  assert.equal(result.response.status, 400);
  assert.match(result.body.error, /mixed|trusted/i);
});

test('control API requires explicit trust for loopback upstreams', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-ssrf-'));
  const server = createControlServer({ store: new ConfigStore(path.join(dir, 'config.json')), vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key'), allowUnauthenticated: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await jsonRequest(`http://127.0.0.1:${server.address().port}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Unsafe', baseUrl: 'http://127.0.0.1:1', protocol: 'Chat' }) });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Private/);
  } finally { server.close(); }
});

test('control API validates and persists bounded usage retention settings', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-settings-'));
  const server = createControlServer({ store: new ConfigStore(path.join(dir, 'config.json')), vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key'), allowUnauthenticated: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const updated = await jsonRequest(`${base}/v1/control/settings`, { method: 'PATCH', body: JSON.stringify({ usageRetentionCount: 42 }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.settings.usageRetentionCount, 42);
  const invalid = await jsonRequest(`${base}/v1/control/settings`, { method: 'PATCH', body: JSON.stringify({ usageRetentionCount: 0 }) });
  assert.equal(invalid.response.status, 400);
});

test('control API rejects route updates that create an active alias conflict', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-route-conflict-update-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const server = createControlServer({ store, vault, allowUnauthenticated: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const upstream = await jsonRequest(`${base}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Mock', baseUrl: 'http://127.0.0.1:1', protocol: 'Chat', allowPrivateNetwork: true }) });
  const first = await jsonRequest(`${base}/v1/control/routes`, { method: 'POST', body: JSON.stringify({ alias: 'same', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: upstream.body.id, modelId: 'model-a' }) });
  const second = await jsonRequest(`${base}/v1/control/routes`, { method: 'POST', body: JSON.stringify({ alias: 'other', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: upstream.body.id, modelId: 'model-b' }) });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  const updated = await jsonRequest(`${base}/v1/control/routes/${second.body.id}`, { method: 'PATCH', body: JSON.stringify({ alias: 'same' }) });
  assert.equal(updated.response.status, 409);
  assert.equal(updated.body.error, 'route_conflict');
});

test('control API does not carry private-network trust across a destination change', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-ssrf-update-'));
  const server = createControlServer({ store: new ConfigStore(path.join(dir, 'config.json')), vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key'), allowUnauthenticated: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await jsonRequest(`${base}/v1/control/upstreams`, { method: 'POST', body: JSON.stringify({ name: 'Trusted', baseUrl: 'http://127.0.0.1:1', protocol: 'Chat', allowPrivateNetwork: true }) });
  assert.equal(created.response.status, 201);
  const updated = await jsonRequest(`${base}/v1/control/upstreams/${created.body.id}`, { method: 'PATCH', body: JSON.stringify({ baseUrl: 'http://127.0.0.2:1' }) });
  assert.equal(updated.response.status, 400);
  assert.match(updated.body.error, /Private|trusted/i);
});

test('control API refuses to start without an authentication token outside test mode', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-auth-required-'));
  assert.throws(() => createControlServer({ store: new ConfigStore(path.join(dir, 'config.json')), vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key') }), /CXRG_CONTROL_TOKEN/);
});

async function routeBatchFixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-route-batch-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  await store.update(config => ({ ...config, upstreams: [{ id: 'up-a', enabled: true }, { id: 'up-b', enabled: true }] }));
  const server = createControlServer({ store, vault: new SecretVault(path.join(dir, 'secrets.json'), 'test-only'), controlToken: 'control-test' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/v1/control/routes/batch`;
  const request = input => jsonRequest(url, { method: 'POST', headers: { authorization: 'Bearer control-test' }, body: JSON.stringify({ inboundProtocol: 'Res', outboundProtocol: 'Chat', ...input }) });
  return { store, url, request };
}

test('batch routes persist every selected model by its original name and protect the control endpoint', async t => {
  const { store, url, request } = await routeBatchFixture(t);
  assert.equal((await jsonRequest(url, { method: 'POST', body: '{}' })).response.status, 401);
  const targets = [{ upstreamId: 'up-a', modelId: 'alpha' }, { upstreamId: 'up-a', modelId: 'beta' }, { upstreamId: 'up-b', modelId: 'gamma' }];
  const result = await request({ targets });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.routes.map(route => [route.alias, route.modelId, route.upstreamId]), targets.map(target => [target.modelId, target.modelId, target.upstreamId]));
  assert.equal(new Set(result.body.routes.map(route => route.id)).size, 3);
  assert.deepEqual((await new ConfigStore(store.filePath).read()).routes, result.body.routes);
});

test('invalid batches write nothing and incompatible protocol conflicts are rejected', async t => {
  const { store, request } = await routeBatchFixture(t);
  await request({ targets: [{ upstreamId: 'up-a', modelId: 'taken' }] });
  const before = await fs.readFile(store.filePath, 'utf8');
  for (const [targets, status] of [
    [[{ upstreamId: 'up-a', modelId: 'new' }, { upstreamId: 'missing', modelId: 'invalid' }], 400],
    [[], 400],
  ]) {
    assert.equal((await request({ targets })).response.status, status);
    assert.equal(await fs.readFile(store.filePath, 'utf8'), before);
  }
  assert.equal((await request({ outboundProtocol: 'Mes', targets: [{ upstreamId: 'up-b', modelId: 'taken' }] })).response.status, 409);
  assert.equal(await fs.readFile(store.filePath, 'utf8'), before);
  assert.equal((await request({ editId: 'missing', targets: [{ upstreamId: 'up-a', modelId: 'alpha' }] })).response.status, 404);
});

test('concurrent batches cannot create duplicate active model routes', async t => {
  const { store, request } = await routeBatchFixture(t);
  const targets = [{ upstreamId: 'up-a', modelId: 'concurrent' }];
  const results = await Promise.all([request({ targets }), request({ targets })]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 200]);
  assert.equal((await store.read()).routes.length, 1);
  assert.equal((await store.read()).routes[0].targets.length, 1);
});

test('priority policy and order persist, can be edited, and reject invalid settings atomically', async t => {
  const { store, request } = await routeBatchFixture(t);
  const targets = [{ upstreamId: 'up-b', modelId: 'same' }, { upstreamId: 'up-a', modelId: 'same' }];
  const policy = { failureThreshold: 2, statusClasses: [4] };
  const created = await request({ targets, failover: policy });
  assert.equal(created.response.status, 200);
  assert.deepEqual(created.body.routes[0].targets, targets);
  assert.deepEqual(created.body.routes[0].failover, { ...policy, cooldownSeconds: 60 });
  const edited = await request({ editId: created.body.routes[0].id, targets: [...targets].reverse(), failover: { failureThreshold: 4, statusClasses: [5] } });
  assert.equal(edited.response.status, 200);
  assert.deepEqual(edited.body.routes[0].targets, [...targets].reverse());
  assert.equal(edited.body.routes[0].failover.failureThreshold, 4);
  const before = await fs.readFile(store.filePath, 'utf8');
  for (const bad of [{ failureThreshold: 0, statusClasses: [5] }, { failureThreshold: 101, statusClasses: [4] }, { failureThreshold: 2, statusClasses: [] }, { failureThreshold: 2, statusClasses: [3] }]) {
    assert.equal((await request({ targets, failover: bad })).response.status, 400);
    assert.equal(await fs.readFile(store.filePath, 'utf8'), before);
  }
});

test('editing a legacy route preserves its existing call name and ID while adding new selected models', async t => {
  const { store, request } = await routeBatchFixture(t);
  await store.update(config => ({ ...config, routes: [{ id: 'legacy', alias: 'old-client-name', modelId: 'alpha', upstreamId: 'up-a', inboundProtocol: 'Res', outboundProtocol: 'Chat', enabled: true }] }));
  const result = await request({ editId: 'legacy', targets: [{ upstreamId: 'up-b', modelId: 'beta' }, { upstreamId: 'up-a', modelId: 'alpha' }] });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.routes.find(route => route.modelId === 'alpha').id, 'legacy');
  assert.equal(result.body.routes.find(route => route.id === 'legacy').alias, 'old-client-name');
  assert.equal(result.body.routes.find(route => route.modelId === 'beta').alias, 'beta');
});
