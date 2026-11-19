import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { createGatewayServer, validateDestination } from '../../services/gateway/src/server.mjs';

function listen(server) { return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }

test('gateway authenticates and forwards Chat requests through a configured route', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    assert.match(req.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    const body = JSON.parse(await new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; }); req.on('end', () => resolve(data)); req.on('error', reject); }));
    assert.deepEqual(body.metadata, { trace: 'keep' });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'upstream-1', choices: [{ index: 0, message: { role: 'assistant', content: `echo:${body.messages[0].content}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-gateway-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const createdUpstream = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mock', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Chat', apiKey: 'upstream-secret', allowPrivateNetwork: true }) }).then((r) => r.json());
  const createdRoute = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'demo', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: createdUpstream.id, modelId: 'mock-model' }) }).then((r) => r.json());
  const clientKey = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'client' }) }).then((r) => r.json());
  assert.ok(createdRoute.id);
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });

  const unauthorized = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(unauthorized.status, 401);
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey.key}` }, body: JSON.stringify({ model: 'demo', metadata: { trace: 'keep' }, messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.choices[0].message.content, 'echo:hello');
  const logs = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/logs?limit=10`).then((r) => r.json());
  assert.equal(logs.logs.length, 1);
  assert.equal(logs.logs[0].status, 'completed');
  assert.equal('content' in logs.logs[0], false);
  assert.equal(typeof logs.logs[0].durationMs, 'number');
  const metrics = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/metrics`).then((r) => r.json());
  assert.equal(metrics.total, 1);
  assert.equal(metrics.completed, 1);
  const stateAfter = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/state`).then((r) => r.json());
  assert.equal(typeof stateAfter.clientKeys[0].lastUsedAt, 'string');
});

test('gateway enforces the configured usage retention bound', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-retention-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, settings: { ...config.settings, usageRetentionCount: 2 }, upstreams: [{ id: 'retention-upstream', name: 'Retention', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }], routes: [{ id: 'retention-route', alias: 'retention-model', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'retention-upstream', modelId: 'retention-model', enabled: true }], clientKeys: [{ id: 'retention-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'retention' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  for (let index = 0; index < 3; index += 1) {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'retention-model', messages: [{ role: 'user', content: `request-${index}` }] }) });
    assert.equal(response.status, 200);
  }
  const config = await store.read();
  assert.equal(config.usage.length, 2);
});

test('gateway exposes authenticated route models with client scope filtering', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-models-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, routes: [{ id: 'model-route-a', alias: 'visible-model', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'unused', modelId: 'visible-model', enabled: true }, { id: 'model-route-b', alias: 'hidden-model', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'unused', modelId: 'hidden-model', enabled: true }], clientKeys: [{ id: 'models-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: ['visible-model'], createdAt: new Date().toISOString(), enabled: true, name: 'models' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/models`, { headers: { authorization: `Bearer ${clientKey}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.map((item) => item.id), ['visible-model']);
});

test('gateway enforces client-key model scope', async (t) => {
  const upstream = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'should not run' } }] })); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-scope-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'scope-upstream', name: 'Scope', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'scope-route', alias: 'scope-model', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'scope-upstream', modelId: 'scope-model', enabled: true }], clientKeys: [{ id: 'scope-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: ['other-model'], createdAt: new Date().toISOString(), enabled: true, name: 'scope' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'scope-model', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'forbidden');
});

test('gateway sanitizes upstream failures and records the failure code', async (t) => {
  const upstream = http.createServer((_req, res) => { res.statusCode = 500; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: { message: 'secret-provider-detail', type: 'provider_internal' } })); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-upstream-error-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'error-upstream', name: 'Error', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'error-route', alias: 'error', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'error-upstream', modelId: 'error-model', enabled: true }], clientKeys: [{ id: 'error-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'error' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'error', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, 'upstream_error');
  assert.equal(body.message, undefined);
  const config = await store.read();
  assert.equal(config.usage.at(-1).status, 'failed');
  assert.equal(config.usage.at(-1).errorCode, 'upstream_error');
});

test('gateway converts Chat text requests to Messages and returns Chat response shape', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    const body = JSON.parse(await new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; }); req.on('end', () => resolve(data)); req.on('error', reject); }));
    assert.equal(req.url, '/v1/messages');
    assert.equal(body.messages[0].content, 'hello cross');
    assert.equal(body.system, 'be concise');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'msg-1', content: [{ type: 'text', text: 'cross reply' }], stop_reason: 'end_turn' }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-cross-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const controlBase = `http://127.0.0.1:${control.address().port}`;
  const upstreamRecord = await fetch(`${controlBase}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', apiKey: 'secret', allowPrivateNetwork: true }) }).then((r) => r.json());
  await fetch(`${controlBase}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'cross', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: upstreamRecord.id, modelId: 'claude-test' }) });
  const key = await fetch(`${controlBase}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'cross-client' }) }).then((r) => r.json());
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: 'cross', messages: [{ role: 'system', content: 'be concise' }, { role: 'user', content: 'hello cross' }] }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content, 'cross reply');
});

test('gateway rejects unsupported cross-protocol features before upstream I/O', async (t) => {
  const upstream = http.createServer(() => { throw new Error('upstream should not be called'); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-reject-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const base = `http://127.0.0.1:${control.address().port}`;
  const upstreamRecord = await fetch(`${base}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', allowPrivateNetwork: true }) }).then((r) => r.json());
  await fetch(`${base}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'reject', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: upstreamRecord.id, modelId: 'claude-test' }) });
  const key = await fetch(`${base}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'reject-client' }) }).then((r) => r.json());
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: 'reject', response_format: { type: 'json_schema' }, messages: [{ role: 'user', content: 'no structured output conversion' }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'unsupported_feature');
  const logs = await fetch(`${base}/v1/control/logs?limit=10`).then((r) => r.json());
  assert.equal(logs.logs.some((item) => item.status === 'rejected' && item.errorCode === 'unsupported_feature'), true);
});

test('gateway converts Responses input to Chat and returns Responses output', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    const body = JSON.parse(await new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; }); req.on('end', () => resolve(data)); req.on('error', reject); }));
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'be concise');
    assert.equal(body.messages[1].content, 'from responses');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'chat-1', choices: [{ message: { role: 'assistant', content: 'back to responses' }, finish_reason: 'stop' }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-responses-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const base = `http://127.0.0.1:${control.address().port}`;
  const upstreamRecord = await fetch(`${base}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Chat', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', allowPrivateNetwork: true }) }).then((r) => r.json());
  await fetch(`${base}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'response-demo', inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: upstreamRecord.id, modelId: 'chat-model' }) });
  const key = await fetch(`${base}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'responses-client' }) }).then((r) => r.json());
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: 'response-demo', instructions: 'be concise', input: 'from responses' }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.output[0].content[0].text, 'back to responses');
});

test('gateway converts Messages input to Responses and returns Messages output', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    const body = JSON.parse(await new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; }); req.on('end', () => resolve(data)); req.on('error', reject); }));
    assert.equal(req.url, '/v1/responses');
    assert.equal(body.input[0].content, 'from messages');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'response-1', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'back to messages' }] }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-messages-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const base = `http://127.0.0.1:${control.address().port}`;
  const upstreamRecord = await fetch(`${base}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Responses', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Res', allowPrivateNetwork: true }) }).then((r) => r.json());
  await fetch(`${base}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'message-demo', inboundProtocol: 'Mes', outboundProtocol: 'Res', upstreamId: upstreamRecord.id, modelId: 'response-model' }) });
  const key = await fetch(`${base}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'messages-client' }) }).then((r) => r.json());
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: 'message-demo', messages: [{ role: 'user', content: 'from messages' }], max_tokens: 32 }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.content[0].text, 'back to messages');
});

test('gateway covers the remaining cross-protocol directions and native forwarding', async (t) => {
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    received.push({ path: req.url, body: JSON.parse(data) });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/messages') return res.end(JSON.stringify({ id: 'mes', content: [{ type: 'text', text: 'reply-mes' }] }));
    if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'reply-chat' }, finish_reason: 'stop' }] }));
    return res.end(JSON.stringify({ id: 'res', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'reply-res' }] }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-matrix-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const upstreamId = 'matrix-upstream';
  const routes = [
    ['res-mes', 'Res', 'Mes'], ['mes-chat', 'Mes', 'Chat'], ['chat-res', 'Chat', 'Res'],
    ['native-res', 'Res', 'Res'], ['native-mes', 'Mes', 'Mes'],
  ].map(([alias, inboundProtocol, outboundProtocol]) => ({ id: `route-${alias}`, alias, inboundProtocol, outboundProtocol, upstreamId, modelId: `model-${alias}`, enabled: true }));
  await store.update((config) => ({ ...config, upstreams: [{ id: upstreamId, name: 'Matrix', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes, clientKeys: [{ id: 'matrix-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'matrix' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const call = async (pathName, body) => fetch(`${base}${pathName}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify(body) }).then(async (response) => ({ status: response.status, body: await response.json() }));

  const resMes = await call('/v1/responses', { model: 'res-mes', input: 'res to mes' });
  const mesChat = await call('/v1/messages', { model: 'mes-chat', messages: [{ role: 'user', content: 'mes to chat' }] });
  const chatRes = await call('/v1/chat/completions', { model: 'chat-res', messages: [{ role: 'user', content: 'chat to res' }] });
  assert.equal(resMes.body.output[0].content[0].text, 'reply-mes');
  assert.equal(mesChat.body.content[0].text, 'reply-chat');
  assert.equal(chatRes.body.choices[0].message.content, 'reply-res');

  await call('/v1/responses', { model: 'native-res', input: 'native', metadata: { preserve: true } });
  await call('/v1/messages', { model: 'native-mes', messages: [{ role: 'user', content: 'native' }], metadata: { preserve: true }, tools: [{ name: 'lookup' }] });
  assert.equal(received.find((item) => item.path === '/v1/responses' && item.body.metadata?.preserve)?.body.metadata.preserve, true);
  assert.equal(received.find((item) => item.path === '/v1/messages' && item.body.metadata?.preserve)?.body.metadata.preserve, true);
  assert.deepEqual(received.find((item) => item.path === '/v1/messages' && item.body.metadata?.preserve)?.body.tools, [{ name: 'lookup' }]);
});

test('gateway forwards native Chat streaming events without converting the wire format', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"type":"response.output_text.delta","delta":"hello"}\n\n');
    setTimeout(() => { res.end('data: [DONE]\n\n'); }, 10);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'stream-upstream', name: 'Stream', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'stream-route', alias: 'stream', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'stream-upstream', modelId: 'stream-model', enabled: true }], clientKeys: [{ id: 'stream-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'stream' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'stream', stream: true, messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(await response.text(), 'data: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: [DONE]\n\n');
});

test('gateway converts simple text streaming from Messages to Chat', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"hello"}}\n\n');
    setTimeout(() => res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n'), 10);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-cross-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'stream-cross-upstream', name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'stream-cross-route', alias: 'stream-cross', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: 'stream-cross-upstream', modelId: 'messages-model', enabled: true }], clientKeys: [{ id: 'stream-cross-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'stream-cross' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'stream-cross', stream: true, messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"delta":\{"content":"hello"\}/);
  assert.match(text, /data: \[DONE\]/);
});

test('gateway converts a single streamed tool call from Messages to Chat', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: content_block_start\ndata: {"content_block":{"type":"tool_use","id":"tool-stream","name":"lookup"}}\n\n');
    res.write('event: content_block_delta\ndata: {"delta":{"type":"input_json_delta","partial_json":"{\\"key\\":\\"a\\"}"}}\n\n');
    setTimeout(() => res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n'), 10);
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-tool-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'tool-stream-upstream', name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'tool-stream-route', alias: 'tool-stream', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: 'tool-stream-upstream', modelId: 'tool-stream-model', enabled: true }], clientKeys: [{ id: 'tool-stream-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'tool-stream' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'tool-stream', stream: true, messages: [{ role: 'user', content: 'lookup a' }], tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }] }) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"tool_calls":\[\{"index":0,"id":"tool-stream","type":"function","function":\{"name":"lookup","arguments":""\}\}\]/);
  assert.match(text, /"arguments":"\{\\"key\\":\\"a\\"\}"/);
  assert.match(text, /"finish_reason":"tool_calls"/);
});

test('gateway preserves indexes for parallel streamed tool calls from Messages to Chat', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"tool-a","name":"lookup"}}\n\n');
    res.write('event: content_block_start\ndata: {"index":1,"content_block":{"type":"tool_use","id":"tool-b","name":"lookup"}}\n\n');
    res.write('event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"key\\":\\"a\\"}"}}\n\n');
    res.write('event: content_block_delta\ndata: {"index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"key\\":\\"b\\"}"}}\n\n');
    res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-parallel-tool-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'parallel-stream-upstream', name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'parallel-stream-route', alias: 'parallel-stream', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: 'parallel-stream-upstream', modelId: 'parallel-model', enabled: true }], clientKeys: [{ id: 'parallel-stream-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'parallel-stream' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'parallel-stream', stream: true, messages: [{ role: 'user', content: 'lookup a and b' }], tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }] }) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"index":0,"id":"tool-a"/);
  assert.match(text, /"index":1,"id":"tool-b"/);
  assert.match(text, /"arguments":"\{\\"key\\":\\"a\\"\}"/);
  assert.match(text, /"arguments":"\{\\"key\\":\\"b\\"\}"/);
});

test('gateway converts parallel streamed tool calls from Chat to Messages', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","type":"function","function":{"name":"lookup","arguments":""}},{"index":1,"id":"call-b","type":"function","function":{"name":"lookup","arguments":""}}]}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"key\\":\\"a\\"}"}},{"index":1,"function":{"arguments":"{\\"key\\":\\"b\\"}"}}]}}]}\n\n');
    res.end('data: [DONE]\n\n');
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-parallel-chat-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'parallel-chat-upstream', name: 'Chat', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'parallel-chat-route', alias: 'parallel-chat', inboundProtocol: 'Mes', outboundProtocol: 'Chat', upstreamId: 'parallel-chat-upstream', modelId: 'parallel-chat-model', enabled: true }], clientKeys: [{ id: 'parallel-chat-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'parallel-chat' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}`, 'anthropic-version': '2026-10-21' }, body: JSON.stringify({ model: 'parallel-chat', stream: true, max_tokens: 100, messages: [{ role: 'user', content: 'lookup a and b' }], tools: [{ name: 'lookup', input_schema: { type: 'object' } }] }) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"index":0,"content_block":\{"type":"tool_use","id":"call-a"/);
  assert.match(text, /"index":1,"content_block":\{"type":"tool_use","id":"call-b"/);
  assert.match(text, /"index":0,"delta":\{"type":"input_json_delta","partial_json":"\{\\"key\\":\\"a\\"\}"/);
  assert.match(text, /"index":1,"delta":\{"type":"input_json_delta","partial_json":"\{\\"key\\":\\"b\\"\}"/);
});

test('gateway converts parallel streamed tool calls from Chat to Responses', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","type":"function","function":{"name":"lookup","arguments":""}},{"index":1,"id":"call-b","type":"function","function":{"name":"lookup","arguments":""}}]}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"key\\":\\"a\\"}"}},{"index":1,"function":{"arguments":"{\\"key\\":\\"b\\"}"}}]}}]}\n\n');
    res.end('data: [DONE]\n\n');
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-parallel-responses-stream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'parallel-responses-upstream', name: 'Chat', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'parallel-responses-route', alias: 'parallel-responses', inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'parallel-responses-upstream', modelId: 'parallel-responses-model', enabled: true }], clientKeys: [{ id: 'parallel-responses-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'parallel-responses' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'parallel-responses', stream: true, input: 'lookup a and b', tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }] }) });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"output_index":0,"item":\{"type":"function_call","id":"call-a"/);
  assert.match(text, /"output_index":1,"item":\{"type":"function_call","id":"call-b"/);
  assert.match(text, /"output_index":0,"delta":"\{\\"key\\":\\"a\\"\}"/);
  assert.match(text, /"output_index":1,"delta":"\{\\"key\\":\\"b\\"\}"/);
});

test('gateway converts one function tool definition and tool call from Chat to Messages', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    assert.deepEqual(body.tools, [{ name: 'lookup', description: 'Find a value', input_schema: { type: 'object', properties: { key: { type: 'string' } } } }]);
    if (body.messages.some((item) => Array.isArray(item.content) && item.content.some((part) => part.type === 'tool_result'))) {
      assert.equal(body.messages.at(-1).content[0].tool_use_id, 'tool-1');
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id: 'tool-msg-result', content: [{ type: 'text', text: 'tool result accepted' }], stop_reason: 'end_turn' }));
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'tool-msg', content: [{ type: 'tool_use', id: 'tool-1', name: 'lookup', input: { key: 'alpha' } }], stop_reason: 'tool_use' }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-tools-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'tool-upstream', name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'tool-route', alias: 'tool', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: 'tool-upstream', modelId: 'tool-model', enabled: true }], clientKeys: [{ id: 'tool-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'tool' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'tool', messages: [{ role: 'user', content: 'find alpha' }], tools: [{ type: 'function', function: { name: 'lookup', description: 'Find a value', parameters: { type: 'object', properties: { key: { type: 'string' } } } } }] }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].finish_reason, 'tool_calls');
  assert.equal(body.choices[0].message.tool_calls[0].function.name, 'lookup');
  assert.deepEqual(JSON.parse(body.choices[0].message.tool_calls[0].function.arguments), { key: 'alpha' });
  const followUp = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'tool', messages: [{ role: 'user', content: 'find alpha' }, { role: 'assistant', content: null, tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'lookup', arguments: '{"key":"alpha"}' } }] }, { role: 'tool', tool_call_id: 'tool-1', content: 'value-from-client' }], tools: [{ type: 'function', function: { name: 'lookup', description: 'Find a value', parameters: { type: 'object', properties: { key: { type: 'string' } } } } }] }) });
  assert.equal(followUp.status, 200);
  assert.equal((await followUp.json()).choices[0].message.content, 'tool result accepted');
});

test('gateway converts multiple function calls and result blocks in one turn', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    const hasResults = body.messages.some((item) => Array.isArray(item.content) && item.content.filter((part) => part.type === 'tool_result').length === 2);
    res.setHeader('content-type', 'application/json');
    if (hasResults) return res.end(JSON.stringify({ id: 'multi-final', content: [{ type: 'text', text: 'both tools accepted' }], stop_reason: 'end_turn' }));
    return res.end(JSON.stringify({ id: 'multi-tools', content: [{ type: 'tool_use', id: 'tool-a', name: 'lookup', input: { key: 'a' } }, { type: 'tool_use', id: 'tool-b', name: 'lookup', input: { key: 'b' } }], stop_reason: 'tool_use' }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-multi-tools-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'multi-upstream', name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'multi-route', alias: 'multi', inboundProtocol: 'Chat', outboundProtocol: 'Mes', upstreamId: 'multi-upstream', modelId: 'multi-model', enabled: true }], clientKeys: [{ id: 'multi-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'multi' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const tools = [{ type: 'function', function: { name: 'lookup', description: 'Find a value', parameters: { type: 'object', properties: { key: { type: 'string' } } } } }];
  const first = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'multi', messages: [{ role: 'user', content: 'find a and b' }], tools }) });
  const firstBody = await first.json();
  assert.equal(firstBody.choices[0].message.tool_calls.length, 2);
  const second = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'multi', messages: [{ role: 'user', content: 'find a and b' }, { role: 'assistant', content: null, tool_calls: firstBody.choices[0].message.tool_calls }, { role: 'tool', tool_call_id: 'tool-a', content: 'value-a' }, { role: 'tool', tool_call_id: 'tool-b', content: 'value-b' }], tools }) });
  assert.equal((await second.json()).choices[0].message.content, 'both tools accepted');
});

test('gateway connects to the validated DNS address and preserves the upstream host', async (t) => {
  let receivedHost;
  const upstream = http.createServer((req, res) => { receivedHost = req.headers.host; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'approved' } }] })); });
  const upstreamPort = await listen(upstream); t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-dns-pinned-'));
  const store = new ConfigStore(path.join(dir, 'config.json')); const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'pinned-client';
  await store.update(config => ({ ...config, upstreams: [{ id: 'u', baseUrl: `http://approved.invalid:${upstreamPort}`, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }], routes: [{ id: 'r', alias: 'm', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'u', modelId: 'm', enabled: true }], clientKeys: [{ id: 'k', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), enabled: true }] }));
  const gateway = createGatewayServer({ store, vault, dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }] }); await listen(gateway); t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'approved');
  assert.equal(receivedHost, `approved.invalid:${upstreamPort}`);
});

test('gateway rejects an upstream whose DNS result no longer matches the approved address snapshot', async (t) => {
  const upstream = http.createServer(() => { throw new Error('DNS drift target must not be called'); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-dns-drift-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'drift-upstream', name: 'Drift', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['192.0.2.1'], enabled: true }], routes: [{ id: 'drift-route', alias: 'drift', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'drift-upstream', modelId: 'drift-model', enabled: true }], clientKeys: [{ id: 'drift-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'drift' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'drift', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_error');
});

test('gateway rejects mixed public and private upstream DNS answers', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-gateway-mixed-dns-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'mixed-upstream', name: 'Mixed', baseUrl: 'http://mixed.test:1', protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1', '8.8.8.8'], enabled: true }], routes: [{ id: 'mixed-route', alias: 'mixed-model', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'mixed-upstream', modelId: 'mixed-model', enabled: true }], clientKeys: [{ id: 'mixed-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'mixed' }] }));
  const gateway = createGatewayServer({ store, vault, dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }, { address: '8.8.8.8', family: 4 }] });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'mixed-model', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_error');
});

test('gateway network policy rejects mixed answers before any fetch', async () => {
  await assert.rejects(() => validateDestination('http://mixed.test:1', true, [], async () => [{ address: '127.0.0.1', family: 4 }, { address: '8.8.8.8', family: 4 }]), /Mixed public and private/);
});

test('gateway enforces a concurrent request limit', async (t) => {
  const upstream = http.createServer(async (_req, res) => { await new Promise((resolve) => setTimeout(resolve, 100)); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-concurrency-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update((config) => ({ ...config, upstreams: [{ id: 'limit-upstream', name: 'Limit', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'limit-route', alias: 'limit', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'limit-upstream', modelId: 'limit-model', enabled: true }], clientKeys: [{ id: 'limit-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'limit' }] }));
  const gateway = createGatewayServer({ store, vault, maxConcurrentRequests: 1 });
  await listen(gateway);
  t.after(() => gateway.close());
  const request = () => fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'limit', messages: [{ role: 'user', content: 'hello' }] }) });
  const first = request();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await request();
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, 'concurrency_limited');
  assert.equal((await request()).status, 429, 'a rejected request must not release the active request slot');
  assert.equal((await (await first).json()).choices[0].message.content, 'ok');
});
