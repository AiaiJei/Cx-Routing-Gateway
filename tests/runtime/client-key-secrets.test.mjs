import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';

const digest = key => crypto.createHash('sha256').update(key).digest('hex');
const root = path.resolve('.tmp/codex-memory-effort-20261126/client-key-fixtures');
async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'control-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'fixture-only-master-key');
  await store.update(value => ({ ...value, routes: [
    { id: 'allowed', alias: 'allowed', enabled: true, inboundProtocol: 'Res' },
    { id: 'hidden', alias: 'hidden', enabled: true, inboundProtocol: 'Res' },
  ] }));
  const server = createControlServer({ store, vault, controlToken: 'fixture-control-token' });
  const gateway = createGatewayServer({ store, vault });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); gateway.closeAllConnections(); gateway.close(); });
  const base = `http://127.0.0.1:${server.address().port}/v1/control`;
  const request = async (suffix, method = 'GET', input, authenticated = true) => {
    const response = await fetch(`${base}${suffix}`, { method, headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer fixture-control-token' } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    return { status: response.status, body: await response.json() };
  };
  const models = async key => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/models`, { headers: { authorization: `Bearer ${key}` } });
    return { status: response.status, body: await response.json() };
  };
  const legacy = async (key = 'fixture-legacy-original') => {
    const record = { id: 'legacy', name: 'Legacy', scope: ['allowed'], enabled: true, keyHash: digest(key) };
    await store.update(value => ({ ...value, clientKeys: [...value.clientKeys, record] }));
    return { ...record, key };
  };
  return { dir, store, vault, request, models, legacy };
}
const gate = () => {
  let release; let started;
  return { wait: new Promise(resolve => { release = resolve; }), started: new Promise(resolve => { started = resolve; }), release: () => release(), mark: () => started() };
};

test('client keys are encrypted at creation and metadata/state never expose hash or vault reference', async t => {
  const { dir, store, vault, request } = await fixture(t);
  const created = await request('/client-keys', 'POST', { name: 'Codex', scope: ['allowed'] });
  assert.equal(created.status, 201);
  const record = (await store.read()).clientKeys[0];
  assert.equal(typeof record.secretRef, 'string');
  assert.equal(await vault.get(record.secretRef), created.body.key);
  const listed = await request('/client-keys');
  assert.deepEqual(listed, { status: 200, body: { credentials: [{ id: record.id, name: 'Codex', scope: ['allowed'], enabled: true, secretAvailable: true }] } });
  const state = await request('/state');
  for (const body of [listed.body, state.body]) {
    assert.equal(JSON.stringify(body).includes(record.secretRef), false);
    assert.equal(JSON.stringify(body).includes(record.keyHash), false);
    assert.equal(JSON.stringify(body).includes(created.body.key), false);
  }
  for (const filename of ['config.json', 'config.json.bak', 'secrets.json']) {
    assert.equal((await fs.readFile(path.join(dir, filename), 'utf8')).includes(created.body.key), false);
  }
  assert.deepEqual(await request(`/client-keys/${record.id}/secret`), { status: 200, body: { id: record.id, key: created.body.key } });
});

test('legacy retention verifies original key without changing authentication or scope', async t => {
  const { store, request, models, legacy } = await fixture(t);
  const original = await legacy();
  assert.deepEqual(await request('/client-keys/legacy/secret'), { status: 409, body: { error: 'key_secret_unavailable' } });
  assert.deepEqual(await request('/client-keys/legacy/secret', 'POST', { key: 'wrong-original' }), { status: 409, body: { error: 'key_secret_mismatch' } });
  assert.equal((await store.read()).clientKeys[0].secretRef, undefined);
  const retained = await request('/client-keys/legacy/secret', 'POST', { key: original.key });
  assert.deepEqual(retained, { status: 200, body: { id: 'legacy', name: 'Legacy', scope: ['allowed'], enabled: true, secretAvailable: true } });
  assert.equal((await store.read()).clientKeys[0].keyHash, original.keyHash);
  assert.deepEqual((await models(original.key)).body.data.map(item => item.id), ['allowed']);
  assert.equal((await models('wrong-original')).status, 401);
});

test('credential matching is read-only, enabled-only and never returns the hash', async t => {
  const { store, request, legacy } = await fixture(t);
  const original = await legacy();
  const before = await fs.readFile(store.filePath, 'utf8');
  assert.deepEqual(await request('/client-keys/match', 'POST', { keyHash: original.keyHash }), { status: 200, body: { credential: { id: 'legacy', name: 'Legacy', scope: ['allowed'], enabled: true, secretAvailable: false } } });
  assert.deepEqual(await request('/client-keys/match', 'POST', { keyHash: digest('unknown') }), { status: 200, body: {} });
  assert.deepEqual(await request('/client-keys/match', 'POST', { keyHash: 'bad' }), { status: 400, body: { error: 'invalid_key_hash' } });
  assert.equal(await fs.readFile(store.filePath, 'utf8'), before);
  await request('/client-keys/legacy', 'DELETE');
  assert.deepEqual(await request('/client-keys/match', 'POST', { keyHash: original.keyHash }), { status: 200, body: {} });
});

test('every credential endpoint requires the existing control bearer', async t => {
  const { request, legacy } = await fixture(t);
  const original = await legacy();
  for (const [suffix, method, input] of [
    ['/client-keys', 'GET'], ['/client-keys', 'POST', {}], ['/client-keys/match', 'POST', { keyHash: original.keyHash }],
    ['/client-keys/legacy/secret', 'GET'], ['/client-keys/legacy/secret', 'POST', { key: original.key }],
    ['/client-keys/legacy/rotate', 'POST', {}], ['/client-keys/legacy', 'DELETE'], ['/client-keys/legacy/permanent', 'DELETE'],
  ]) assert.equal((await request(suffix, method, input, false)).status, 401);
});

test('revocation blocks reads/retention and rotation replaces the old encrypted secret', async t => {
  const { store, vault, request, models } = await fixture(t);
  const created = await request('/client-keys', 'POST', { scope: ['allowed'] });
  const id = created.body.id;
  const oldRef = (await store.read()).clientKeys[0].secretRef;
  await request(`/client-keys/${id}`, 'DELETE');
  assert.deepEqual(await request(`/client-keys/${id}/secret`), { status: 409, body: { error: 'key_disabled' } });
  assert.deepEqual(await request(`/client-keys/${id}/secret`, 'POST', { key: created.body.key }), { status: 409, body: { error: 'key_disabled' } });
  assert.equal((await models(created.body.key)).status, 401);
  assert.equal(await vault.get(oldRef), created.body.key);
  const rotated = await request(`/client-keys/${id}/rotate`, 'POST', {});
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.key, created.body.key);
  assert.equal(await vault.get(oldRef), undefined);
  assert.equal((await models(created.body.key)).status, 401);
  assert.equal((await models(rotated.body.key)).status, 200);
  const ref = (await store.read()).clientKeys[0].secretRef;
  await request(`/client-keys/${id}/permanent`, 'DELETE');
  assert.equal(await vault.get(ref), undefined);
  assert.equal((await request(`/client-keys/${id}/secret`)).status, 404);
});

test('a vault value with the wrong hash is never exposed', async t => {
  const { request, store, vault } = await fixture(t);
  const created = await request('/client-keys', 'POST', {});
  const wrongRef = await vault.put('fixture-wrong-vault-secret');
  await store.update(value => ({ ...value, clientKeys: value.clientKeys.map(key => ({ ...key, secretRef: wrongRef })) }));
  assert.deepEqual(await request(`/client-keys/${created.body.id}/secret`), { status: 409, body: { error: 'key_secret_mismatch' } });
});

test('vault failures are sanitized and keep the current credential valid', async t => {
  const { request, models, legacy, vault, store } = await fixture(t);
  const original = await legacy();
  vault.put = async () => { throw Object.assign(new Error(`do not expose ${original.key}`), { statusCode: 400 }); };
  for (const [suffix, input] of [['/client-keys', {}], ['/client-keys/legacy/rotate', {}], ['/client-keys/legacy/secret', { key: original.key }]]) {
    assert.deepEqual(await request(suffix, 'POST', input), { status: 503, body: { error: 'key_secret_storage_unavailable' } });
  }
  assert.equal((await store.read()).clientKeys[0].keyHash, original.keyHash);
  assert.equal((await models(original.key)).status, 200);
});

test('config write failures remove staged secrets and preserve current authentication', async t => {
  const { request, legacy, vault, store, models } = await fixture(t);
  const original = await legacy();
  store.write = async () => { throw new Error('fixture store failure'); };
  for (const [suffix, input] of [['/client-keys', {}], ['/client-keys/legacy/rotate', {}], ['/client-keys/legacy/secret', { key: original.key }]]) {
    assert.deepEqual(await request(suffix, 'POST', input), { status: 503, body: { error: 'key_secret_storage_unavailable' } });
    assert.deepEqual(await vault.readAll(), {});
  }
  assert.equal((await models(original.key)).status, 200);
});

test('a delayed retain cannot restore a revoked, deleted or rotated key', async t => {
  for (const action of ['revoke', 'delete', 'rotate']) {
    const { request, legacy, store, vault } = await fixture(t);
    const original = await legacy();
    const delay = gate();
    const put = vault.put.bind(vault);
    let stagedRef;
    vault.put = async secret => {
      const ref = await put(secret);
      if (secret === original.key) { stagedRef = ref; delay.mark(); await delay.wait; }
      return ref;
    };
    const retain = request('/client-keys/legacy/secret', 'POST', { key: original.key });
    await delay.started;
    const suffix = action === 'rotate' ? '/rotate' : action === 'delete' ? '/permanent' : '';
    assert.equal((await request(`/client-keys/legacy${suffix}`, action === 'rotate' ? 'POST' : 'DELETE', action === 'rotate' ? {} : undefined)).status, 200);
    delay.release();
    const retained = await retain;
    assert.ok([404, 409].includes(retained.status));
    assert.equal(await vault.get(stagedRef), undefined);
    const current = (await store.read()).clientKeys[0];
    if (action === 'delete') assert.equal(current, undefined);
    if (action === 'revoke') assert.equal(current.enabled, false);
    if (action === 'rotate') assert.notEqual(current.keyHash, original.keyHash);
  }
});

test('a delayed rotation cannot enable a concurrently revoked or deleted key', async t => {
  for (const action of ['revoke', 'delete']) {
    const { request, legacy, store, vault } = await fixture(t);
    await legacy();
    const delay = gate(); const put = vault.put.bind(vault); let stagedRef;
    vault.put = async secret => { stagedRef = await put(secret); delay.mark(); await delay.wait; return stagedRef; };
    const rotation = request('/client-keys/legacy/rotate', 'POST', {});
    await delay.started;
    await request(`/client-keys/legacy${action === 'delete' ? '/permanent' : ''}`, 'DELETE');
    delay.release();
    assert.ok([404, 409].includes((await rotation).status));
    assert.equal(await vault.get(stagedRef), undefined);
    const current = (await store.read()).clientKeys[0];
    assert.equal(current?.enabled, action === 'delete' ? undefined : false);
  }
});

test('a delayed secret read cannot return a key after revoke, rotation or deletion', async t => {
  for (const action of ['revoke', 'delete', 'rotate']) {
    const { request, vault } = await fixture(t);
    const created = await request('/client-keys', 'POST', {}); const id = created.body.id;
    const delay = gate(); const get = vault.get.bind(vault);
    vault.get = async ref => { const key = await get(ref); delay.mark(); await delay.wait; return key; };
    const read = request(`/client-keys/${id}/secret`);
    await delay.started;
    await request(`/client-keys/${id}${action === 'rotate' ? '/rotate' : action === 'delete' ? '/permanent' : ''}`, action === 'rotate' ? 'POST' : 'DELETE', action === 'rotate' ? {} : undefined);
    delay.release();
    const result = await read;
    assert.ok([404, 409].includes(result.status));
    assert.equal(JSON.stringify(result.body).includes(created.body.key), false);
  }
});

test('retain and match reject ambiguous input without altering the credential', async t => {
  const { request, store, legacy, vault } = await fixture(t);
  const original = await legacy();
  for (const keyInput of [null, [], {}, { key: '' }, { key: 'with space' }, { key: 'x'.repeat(4097) }, { key: original.key, scope: [] }, { key: original.key, keyHash: original.keyHash }]) {
    assert.deepEqual(await request('/client-keys/legacy/secret', 'POST', keyInput), { status: 400, body: { error: 'invalid_client_key' } });
  }
  for (const input of [null, [], {}, { keyHash: original.keyHash, key: original.key }, { keyHash: original.keyHash, id: 'legacy' }]) {
    assert.deepEqual(await request('/client-keys/match', 'POST', input), { status: 400, body: { error: 'invalid_key_hash' } });
  }
  assert.equal((await store.read()).clientKeys[0].secretRef, undefined);
  assert.deepEqual(await vault.readAll(), {});
});

test('vault read failure and missing secret return safe unavailable states', async t => {
  const { request, vault, store } = await fixture(t);
  const created = await request('/client-keys', 'POST', {});
  const id = created.body.id;
  const get = vault.get.bind(vault);
  vault.get = async () => { throw Object.assign(new Error(`fixture secret ${created.body.key}`), { statusCode: 400 }); };
  assert.deepEqual(await request(`/client-keys/${id}/secret`), { status: 503, body: { error: 'key_secret_storage_unavailable' } });
  vault.get = get;
  await vault.remove((await store.read()).clientKeys[0].secretRef);
  assert.deepEqual(await request(`/client-keys/${id}/secret`), { status: 409, body: { error: 'key_secret_unavailable' } });
});

test('competing rotations retire only their own staged or replaced encrypted secret', async t => {
  const { request, store, vault, models } = await fixture(t);
  const created = await request('/client-keys', 'POST', {}); const id = created.body.id;
  const oldRef = (await store.read()).clientKeys[0].secretRef;
  const delay = gate(); const put = vault.put.bind(vault); let firstRef; let puts = 0;
  vault.put = async secret => {
    const ref = await put(secret);
    if (++puts === 1) { firstRef = ref; delay.mark(); await delay.wait; }
    return ref;
  };
  const first = request(`/client-keys/${id}/rotate`, 'POST', {});
  await delay.started;
  const winner = await request(`/client-keys/${id}/rotate`, 'POST', {});
  assert.equal(winner.status, 200);
  const winnerRef = (await store.read()).clientKeys[0].secretRef;
  delay.release();
  assert.deepEqual(await first, { status: 409, body: { error: 'key_changed' } });
  assert.equal(await vault.get(firstRef), undefined);
  assert.equal(await vault.get(oldRef), undefined);
  assert.equal(await vault.get(winnerRef), winner.body.key);
  assert.equal((await models(winner.body.key)).status, 200);
});

test('competing original retention cannot overwrite a newer retained reference', async t => {
  const { request, legacy, store, vault } = await fixture(t);
  const original = await legacy();
  const delay = gate(); const put = vault.put.bind(vault); let firstRef; let puts = 0;
  vault.put = async secret => {
    const ref = await put(secret);
    if (++puts === 1) { firstRef = ref; delay.mark(); await delay.wait; }
    return ref;
  };
  const first = request('/client-keys/legacy/secret', 'POST', { key: original.key });
  await delay.started;
  assert.equal((await request('/client-keys/legacy/secret', 'POST', { key: original.key })).status, 200);
  const winnerRef = (await store.read()).clientKeys[0].secretRef;
  delay.release();
  assert.deepEqual(await first, { status: 409, body: { error: 'key_changed' } });
  assert.equal(await vault.get(firstRef), undefined);
  assert.equal(await vault.get(winnerRef), original.key);
});

test('cleanup failure reports encrypted residue without undoing committed authentication', async t => {
  const { request, store, vault, models } = await fixture(t);
  const created = await request('/client-keys', 'POST', {}); const id = created.body.id;
  const oldRef = (await store.read()).clientKeys[0].secretRef;
  const remove = vault.remove.bind(vault);
  vault.remove = async ref => { if (ref === oldRef) throw new Error('fixture cleanup failed'); return remove(ref); };
  const rotated = await request(`/client-keys/${id}/rotate`, 'POST', {});
  assert.equal(rotated.status, 200);
  assert.equal(rotated.body.secretCleanupPending, true);
  assert.equal((await models(rotated.body.key)).status, 200);
  assert.equal((await models(created.body.key)).status, 401);
  const activeRef = (await store.read()).clientKeys[0].secretRef;
  vault.remove = async () => { throw new Error('fixture cleanup failed'); };
  assert.deepEqual(await request(`/client-keys/${id}/permanent`, 'DELETE'), { status: 200, body: { id, deleted: true, secretCleanupPending: true } });
  assert.equal((await models(rotated.body.key)).status, 401);
  assert.equal(await vault.get(activeRef), rotated.body.key);
  assert.equal(await vault.get(oldRef), created.body.key);
});

test('a repeated revoke invalidates a rotation that started with an already disabled key', async t => {
  const { request, legacy, store, vault } = await fixture(t);
  await legacy();
  await request('/client-keys/legacy', 'DELETE');
  const delay = gate(); const put = vault.put.bind(vault); let stagedRef;
  vault.put = async secret => { stagedRef = await put(secret); delay.mark(); await delay.wait; return stagedRef; };
  const rotation = request('/client-keys/legacy/rotate', 'POST', {});
  await delay.started;
  assert.equal((await request('/client-keys/legacy', 'DELETE')).status, 200);
  delay.release();
  assert.deepEqual(await rotation, { status: 409, body: { error: 'key_changed' } });
  assert.equal((await store.read()).clientKeys[0].enabled, false);
  assert.equal(await vault.get(stagedRef), undefined);
});

test('committed client secret mutations survive a configuration unlock error', async t => {
  for (const action of ['create', 'rotate', 'retain']) {
    const { request, legacy, store, vault, models } = await fixture(t);
    const original = await legacy();
    if (action === 'rotate') await request('/client-keys/legacy/secret', 'POST', { key: original.key });
    const oldRef = (await store.read()).clientKeys[0].secretRef;
    const acquireLock = store.acquireLock.bind(store);
    store.acquireLock = async () => {
      const release = await acquireLock();
      return async () => { await release(); throw new Error('fixture unlock failed after commit'); };
    };
    const suffix = action === 'create' ? '' : action === 'rotate' ? '/legacy/rotate' : '/legacy/secret';
    const result = await request(`/client-keys${suffix}`, 'POST', action === 'retain' ? { key: original.key } : {});
    assert.equal(result.status, action === 'create' ? 201 : 200);
    assert.equal(result.body.stateWriteReconciled, true);
    const id = result.body.id;
    const current = (await store.read()).clientKeys.find(record => record.id === id);
    const key = action === 'retain' ? original.key : result.body.key;
    assert.equal(await vault.get(current.secretRef), key);
    assert.deepEqual(await request(`/client-keys/${id}/secret`), { status: 200, body: { id, key } });
    assert.equal((await models(key)).status, 200);
    if (oldRef) assert.equal(await vault.get(oldRef), undefined);
    if (action === 'rotate') assert.equal((await models(original.key)).status, 401);
  }
});

test('an unreadable commit outcome preserves the staged ciphertext until state can be read again', async t => {
  for (const committed of [true, false]) {
    const { request, legacy, store, vault, models } = await fixture(t);
    const original = await legacy();
    const update = store.update.bind(store); const read = store.read.bind(store); const put = vault.put.bind(vault);
    let stagedRef; let stagedKey; let readingUnavailable = false;
    vault.put = async key => { stagedKey = key; stagedRef = await put(key); return stagedRef; };
    store.update = async mutator => {
      if (committed) await update(mutator);
      readingUnavailable = true;
      throw new Error('fixture unknown commit outcome');
    };
    store.read = async options => { if (readingUnavailable) throw new Error('fixture state temporarily unreadable'); return read(options); };
    const result = await request('/client-keys/legacy/rotate', 'POST', {});
    assert.deepEqual(result, { status: 503, body: { error: 'key_secret_storage_unavailable' } });
    assert.equal(await vault.get(stagedRef), stagedKey);
    readingUnavailable = false;
    const current = (await store.read()).clientKeys[0];
    assert.equal(current.secretRef, committed ? stagedRef : undefined);
    assert.equal((await models(committed ? stagedKey : original.key)).status, 200);
  }
});

test('reconciliation never returns stale success or deletes ciphertext after a newer revoke', async t => {
  const { request, legacy, store, vault, models } = await fixture(t);
  const original = await legacy();
  const update = store.update.bind(store);
  store.update = async mutator => {
    await update(mutator);
    await update(config => ({ ...config, clientKeys: config.clientKeys.map(record => ({ ...record, enabled: false, authMutationRevision: record.authMutationRevision + 1 })) }));
    throw new Error('fixture failed cleanup after later revoke');
  };
  const result = await request('/client-keys/legacy/rotate', 'POST', {});
  assert.deepEqual(result, { status: 409, body: { error: 'key_changed' } });
  const current = (await store.read()).clientKeys[0];
  const key = await vault.get(current.secretRef);
  assert.equal(typeof key, 'string');
  assert.notEqual(key, original.key);
  assert.equal(current.enabled, false);
  assert.equal((await models(key)).status, 401);
});
