import test from 'node:test';
import { encryptedStorage } from './codex-direct-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';

const require = createRequire(import.meta.url);
const { createCodexRuntimeClient } = require('../../apps/desktop/electron/codex-runtime-client.cjs');
const { createCodexConfigService } = require('../../apps/desktop/electron/codex-config-service.cjs');
const { registerCodexIpc } = require('../../apps/desktop/electron/codex-ipc.cjs');
const { fail } = require('../../apps/desktop/electron/codex-errors.cjs');
const fixtureRoot = path.resolve('.tmp/codex-direct-management-20261126');
const clientKey = 'cxrg_local_ipc_key';
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }));
  return server.address().port;
}
async function fixture(t) {
  await fs.mkdir(fixtureRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(fixtureRoot, 'ipc-'));
  const store = new ConfigStore(path.join(dir, 'runtime.json'));
  await store.update(config => ({
    ...config,
    upstreams: [{ id: 'up-1', name: 'Local', enabled: true }],
    routes: [
      { id: 'res-1', alias: 'coding-model', modelId: 'up-model', upstreamId: 'up-1', enabled: true, inboundProtocol: 'Res', outboundProtocol: 'Chat' },
      { id: 'chat-1', alias: 'chat-only', modelId: 'up-model', upstreamId: 'up-1', enabled: true, inboundProtocol: 'Chat', outboundProtocol: 'Chat' },
    ],
    clientKeys: [{ id: 'key-1', enabled: true, keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: ['coding-model'] }],
  }));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'local-test');
  const controlPort = await listen(t, createControlServer({ store, vault, controlToken: 'local-control-test' }));
  const gatewayPort = await listen(t, createGatewayServer({ store, vault }));
  const runtimeClient = createCodexRuntimeClient({ getControlPort: () => controlPort, getGatewayPort: () => gatewayPort, getControlToken: () => 'local-control-test', isRuntimeReady: () => true });
  return { dir, store, runtimeClient, gatewayPort };
}
test('Codex native IPC validates a scoped Key through actual Gateway and roundtrips isolated configuration', async t => {
  const { dir, runtimeClient, gatewayPort } = await fixture(t);
  const codexHome = path.join(dir, 'codex-home');
  const service = createCodexConfigService({ safeStorage: encryptedStorage(), platform: "win32", profilesPath:path.join(codexHome,'direct-profiles.enc'), codexHome, ...runtimeClient });
  const handlers = new Map();
  registerCodexIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, isTrustedSender: event => event.trusted, getService: () => service });
  const preview = await handlers.get('runtime:codex-preview')({ trusted: true }, { mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1' });
  assert.equal(preview.baseUrl, 'http://127.0.0.1:' + gatewayPort + '/v1');
  const status = await handlers.get('runtime:codex-apply')({ trusted: true }, { mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1', clientKey, expectedRevision: preview.revision });
  assert.equal(status.configured, true);
  assert.equal(status.model, 'coding-model');
  assert.ok(!JSON.stringify(status).includes(clientKey));
  assert.equal((await handlers.get('runtime:codex-status')({ trusted: true })).backup.id, status.backup.id);
  const restored = await handlers.get('runtime:codex-restore')({ trusted: true }, { backupId: status.backup.id, expectedRevision: status.revision });
  assert.equal(restored.exists, false);
  // Model catalogue validation must never trigger a billable model request.
  assert.deepEqual((await fixtureStoreRead(dir)).usage, []);
});
async function fixtureStoreRead(dir) { return new ConfigStore(path.join(dir, 'runtime.json')).read(); }

test('Codex native route validation rejects disabled, non-Responses, ambiguous aliases and missing upstreams', async t => {
  const { store, runtimeClient } = await fixture(t);
  await assert.rejects(runtimeClient.getRoute('chat-1'), { code: 'CODEX_ROUTE_UNAVAILABLE' });
  await assert.rejects(runtimeClient.getRoute('missing'), { code: 'CODEX_ROUTE_UNAVAILABLE' });
  await store.update(config => ({ ...config, routes: config.routes.map(item => item.id === 'res-1' ? { ...item, enabled: false } : item) }));
  await assert.rejects(runtimeClient.getRoute('res-1'), { code: 'CODEX_ROUTE_UNAVAILABLE' });
  await store.update(config => ({ ...config, routes: [{ ...config.routes[0], enabled: true }, { ...config.routes[0], id: 'duplicate', enabled: true }] }));
  await assert.rejects(runtimeClient.getRoute('res-1'), { code: 'CODEX_ROUTE_UNAVAILABLE' });
  await store.update(config => ({ ...config, routes: [config.routes[0]], upstreams: [] }));
  await assert.rejects(runtimeClient.getRoute('res-1'), { code: 'CODEX_ROUTE_UNAVAILABLE' });
});

test('Codex route selection resolves multiple aliases from one coherent Control snapshot', async () => {
  let reads = 0;
  const client = createCodexRuntimeClient({
    getControlPort: () => 4319, getGatewayPort: () => 4318,
    getControlToken: () => 'local-control-test', isRuntimeReady: () => true,
    fetchImpl: async () => {
      reads += 1;
      return new Response(JSON.stringify({
        routes: ['a', 'b'].map(id => ({ id, alias: 'model-' + id, enabled: true, inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'up', modelId: 'remote-' + id })),
        upstreams: [{ id: 'up', enabled: true }],
      }));
    },
  });
  assert.deepEqual(await client.getRoutes(['a', 'b']), { routes: [{ id: 'a', model: 'model-a', outboundProtocol: 'Chat' }, { id: 'b', model: 'model-b', outboundProtocol: 'Chat' }], baseUrl: 'http://127.0.0.1:4318/v1' });
  assert.equal(reads, 1);
  await assert.rejects(client.getRoutes(['a', 'a']), { code: 'CODEX_INPUT_INVALID' });
  assert.equal(reads, 1);
});

test('Codex native key validation rejects revoked Keys and model scope mismatches without changing files', async t => {
  const { dir, store, runtimeClient } = await fixture(t);
  await assert.rejects(runtimeClient.validateKey('cxrg_unknown_key', 'coding-model'), { code: 'CODEX_KEY_REJECTED' });
  await assert.rejects(runtimeClient.validateKey(clientKey, 'another-model'), { code: 'CODEX_KEY_REJECTED' });
  await store.update(config => ({ ...config, clientKeys: config.clientKeys.map(item => ({ ...item, enabled: false })) }));
  await assert.rejects(runtimeClient.validateKey(clientKey, 'coding-model'), { code: 'CODEX_KEY_REJECTED' });
  assert.deepEqual((await fs.readdir(dir)).filter(item => item === 'codex-home'), []);
});

test('Codex native IPC rejects untrusted senders and unknown fields before reading configuration', async () => {
  const handlers = new Map();
  let accessed = false;
  registerCodexIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, isTrustedSender: event => event.trusted, getService: () => { accessed = true; throw new Error('sensitive-native-detail'); } });
  for (const name of ['status', 'preview', 'apply', 'restore']) {
    await assert.rejects(handlers.get('runtime:codex-' + name)({ trusted: false }, {}), { code: 'CODEX_INPUT_INVALID' });
  }
  assert.equal(accessed, false);
  await assert.rejects(handlers.get('runtime:codex-status')({ trusted: true }), error => error.code === 'CODEX_IO_FAILED' && !error.message.includes('sensitive-native-detail'));
});

test('Codex IPC stable errors survive Electron message-only transport without leaking unknown failures', async () => {
  const handlers = new Map();
  let failure = fail('CODEX_CONFIG_CHANGED');
  registerCodexIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    isTrustedSender: () => true,
    getService: () => ({ apply: async () => { throw failure; } }),
  });
  const handler = handlers.get('runtime:codex-apply');
  for (const code of ['CODEX_CONFIG_CHANGED', 'CODEX_KEY_REJECTED', 'CODEX_CONFIG_UNSUPPORTED']) {
    failure = fail(code);
    await assert.rejects(handler({}, {}), error => {
      // ipcRenderer.invoke reconstructs an Error from message only; custom
      // properties such as code are absent on the renderer-side exception.
      const rendererError = new Error("Error invoking remote method 'runtime:codex-apply': " + error.message);
      assert.equal(rendererError.code, undefined);
      assert.equal(rendererError.message.match(/\bCODEX_[A-Z_]+\b/)?.[0], code);
      return true;
    });
  }
  failure = new Error('private-key-and-parser-source');
  await assert.rejects(handler({}, {}), error => {
    const rendererError = new Error(error.message);
    assert.match(rendererError.message, /\bCODEX_IO_FAILED\b/);
    assert.ok(!rendererError.message.includes('private-key-and-parser-source'));
    return true;
  });
});

test('Codex official client IPC gates sender and forwards only fixed manager actions', async () => {
  const handlers = new Map();
  const inputs = [];
  const clientStatus = { available: true, version: '0.167.0', auth: 'signed_out', login: 'idle' };
  registerCodexIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    isTrustedSender: event => event.trusted,
    getService: () => ({}),
    getClientManager: () => ({
      getStatus: async () => clientStatus,
      startLogin: async input => { inputs.push(input); return { ...clientStatus, login: 'pending' }; },
      cancelLogin: async () => clientStatus,
    }),
  });
  assert.deepEqual(await handlers.get('runtime:codex-client-status')({ trusted: true }), clientStatus);
  assert.equal((await handlers.get('runtime:codex-login')({ trusted: true }, { expectedRevision: 'missing' })).login, 'pending');
  assert.deepEqual(inputs, [{ expectedRevision: 'missing' }]);
  assert.deepEqual(await handlers.get('runtime:codex-cancel-login')({ trusted: true }), clientStatus);
  await assert.rejects(handlers.get('runtime:codex-login')({ trusted: false }, { expectedRevision: 'missing' }), { code: 'CODEX_INPUT_INVALID' });
  assert.equal(inputs.length, 1);
});

test('Codex native runtime client fails closed for unavailable runtime, redirects, invalid JSON and oversized replies', async t => {
  const unavailable = createCodexRuntimeClient({ getControlPort: () => 4319, getGatewayPort: () => 4318, getControlToken: () => '', isRuntimeReady: () => false });
  await assert.rejects(unavailable.getRoute('res-1'), { code: 'CODEX_RUNTIME_UNAVAILABLE' });
  let mode = 'redirect';
  let leaked = false;
  const trap = http.createServer((req, res) => { leaked = true; res.end('{}'); });
  const trapPort = await listen(t, trap);
  const local = http.createServer((req, res) => {
    if (mode === 'redirect') { res.writeHead(302, { location: 'http://127.0.0.1:' + trapPort }); res.end(); }
    else if (mode === 'invalid') res.end('secret-invalid-json');
    else { res.writeHead(200); res.end('x'.repeat(1024 * 1024 + 1)); }
  });
  const port = await listen(t, local);
  const client = createCodexRuntimeClient({ getControlPort: () => port, getGatewayPort: () => port, getControlToken: () => 'local-control-test', isRuntimeReady: () => true });
  for (const next of ['redirect', 'invalid', 'large']) {
    mode = next;
    await assert.rejects(client.getRoute('res-1'), error => error.code === 'CODEX_RUNTIME_UNAVAILABLE' && !error.message.includes('secret-invalid-json'));
  }
  assert.equal(leaked, false);
});

test('Codex preload exposes fixed configuration and client channels with structured arguments', async () => {
  const source = await fs.readFile(path.resolve('apps/desktop/electron/preload.cjs'), 'utf8');
  let controls;
  const calls = [];
  vm.runInNewContext(source, { require: id => {
    assert.equal(id, 'electron');
    return { contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'desktopControls'); controls = api; } }, ipcRenderer: { send() {}, invoke: (...args) => { calls.push(args); return Promise.resolve({}); } } };
  } });
  assert.equal(typeof controls.getCodexStatus, 'function');
  await controls.getCodexStatus();
  await controls.previewCodexConfig({ mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1' });
  await controls.applyCodexConfig({ mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1', clientKey, expectedRevision: 'missing' });
  await controls.restoreCodexConfig({ backupId: 'backup-id', expectedRevision: 'revision' });
  await controls.getCodexClientStatus();
  await controls.startCodexLogin({ expectedRevision: 'missing' });
  await controls.cancelCodexLogin();
  await controls.getCodexDirectProfiles();
  await controls.saveCodexDirectProfile({ expectedRevision: 'missing', name: 'Direct' });
  await controls.importCodexDirectProfile({ expectedRevision: 'missing', expectedConfigRevision: 'missing' });
  await controls.duplicateCodexDirectProfile({ expectedRevision: 'missing', id: 'profile' });
  await controls.deleteCodexDirectProfile({ expectedRevision: 'missing', id: 'profile' });
  await controls.getCodexGatewayPreferences();
  await controls.saveCodexGatewayPreferences({ expectedRevision: 'missing', routeIds: [], defaultRouteId: '', credentialSource: 'current' });
  await controls.getCodexGatewayCredentials();
  await controls.retainCodexGatewayCredential({ id: 'key-id', fromCurrent: true });
  assert.deepEqual(calls, [
    ['runtime:codex-status'],
    ['runtime:codex-preview', { mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1' }],
    ['runtime:codex-apply', { mode: 'gateway', routeIds: ['res-1'], defaultRouteId: 'res-1', clientKey, expectedRevision: 'missing' }],
    ['runtime:codex-restore', { backupId: 'backup-id', expectedRevision: 'revision' }],
    ['runtime:codex-client-status'],
    ['runtime:codex-login', { expectedRevision: 'missing' }],
    ['runtime:codex-cancel-login'],
    ['runtime:codex-direct-profiles'],
    ['runtime:codex-direct-save', { expectedRevision: 'missing', name: 'Direct' }],
    ['runtime:codex-direct-import', { expectedRevision: 'missing', expectedConfigRevision: 'missing' }],
    ['runtime:codex-direct-duplicate', { expectedRevision: 'missing', id: 'profile' }],
    ['runtime:codex-direct-delete', { expectedRevision: 'missing', id: 'profile' }],
    ['runtime:codex-gateway-preferences'],
    ['runtime:codex-gateway-preferences-save', { expectedRevision: 'missing', routeIds: [], defaultRouteId: '', credentialSource: 'current' }],
    ['runtime:codex-gateway-credentials'],
    ['runtime:codex-gateway-credential-retain', { id: 'key-id', fromCurrent: true }],
  ]);
});
