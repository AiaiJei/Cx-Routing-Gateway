import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { createGatewayServer, validateDestination } from '../../services/gateway/src/server.mjs';

function listen(server, host = '127.0.0.1') { return new Promise((resolve) => server.listen(0, host, () => resolve(server.address().port))); }

async function createTimeoutFixture(t, upstream, gatewayOptions = {}, upstreamHost = '127.0.0.1', responsesUpstream = 'Chat') {
  const upstreamPort = await listen(upstream, upstreamHost);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-deadline-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'deadline-upstream', name: 'Deadline', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [
      { id: 'deadline-chat-route', alias: 'deadline-chat', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'deadline-upstream', modelId: 'mock-chat', enabled: true },
      { id: 'deadline-res-route', alias: 'deadline-res', inboundProtocol: 'Res', outboundProtocol: responsesUpstream, upstreamId: 'deadline-upstream', modelId: responsesUpstream === 'Mes' ? 'mock-mes' : 'mock-chat', enabled: true },
    ],
    clientKeys: [{ id: 'deadline-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'deadline' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxConcurrentRequests: 1, ...gatewayOptions });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  return {
    store,
    gateway,
    clientKey,
    request(protocol, stream, content = 'hello', extras = {}) {
      const alias = protocol === 'Res' ? 'deadline-res' : 'deadline-chat';
      const endpoint = protocol === 'Res' ? 'responses' : 'chat/completions';
      const body = protocol === 'Res'
        ? { model: alias, stream, input: content, ...extras }
        : { model: alias, stream, messages: [{ role: 'user', content }], ...extras };
      return fetch(`http://127.0.0.1:${gatewayPort}/v1/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
    },
  };
}

function replyFailoverResponse(res, status, content) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
}

async function createFailoverFixture(t, { primaryHandler, backupHandler, extraRoutes = [], gatewayOptions = {}, primaryCredential, backupCredential } = {}) {
  const primary = primaryHandler instanceof http.Server ? primaryHandler : http.createServer(primaryHandler ?? ((_req, res) => replyFailoverResponse(res, 200, 'primary')));
  const backup = backupHandler instanceof http.Server ? backupHandler : http.createServer(backupHandler ?? ((_req, res) => replyFailoverResponse(res, 200, 'backup')));
  const primaryPort = await listen(primary);
  const backupPort = await listen(backup);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-failover-health-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  const primaryCredentialRef = primaryCredential ? await vault.put(primaryCredential) : undefined;
  const backupCredentialRef = backupCredential ? await vault.put(backupCredential) : undefined;
  const targets = [{ upstreamId: 'primary', modelId: 'primary-model' }, { upstreamId: 'backup', modelId: 'backup-model' }];
  const failover = { failureThreshold: 3, statusClasses: [5], cooldownSeconds: 60 };
  await store.update((config) => ({
    ...config,
    upstreams: [
      { id: 'primary', name: 'Primary', baseUrl: `http://127.0.0.1:${primaryPort}`, protocol: 'Chat', credentialRef: primaryCredentialRef, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true },
      { id: 'backup', name: 'Backup', baseUrl: `http://127.0.0.1:${backupPort}`, protocol: 'Chat', credentialRef: backupCredentialRef, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true },
    ],
    routes: [
      { id: 'failover-route', alias: 'failover', inboundProtocol: 'Chat', outboundProtocol: 'Chat', targets, failover, enabled: true },
      ...extraRoutes,
    ],
    clientKeys: [{ id: 'failover-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'failover' }],
  }));
  const gateway = createGatewayServer({ store, vault, ...gatewayOptions });
  const gatewayPort = await listen(gateway);
  t.after(() => {
    gateway.closeAllConnections();
    gateway.close();
    if (primary.listening) {
      primary.closeAllConnections();
      primary.close();
    }
    backup.closeAllConnections();
    backup.close();
  });
  return {
    store,
    gateway,
    primary,
    primaryPort,
    vault,
    primaryCredentialRef,
    request(alias = 'failover', content = 'hello') {
      return fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
        body: JSON.stringify({ model: alias, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(15000),
      });
    },
  };
}

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

test('gateway testRoute executes a route through normal auth, forwarding, and usage logging without persisting a client key', async (t) => {
  const prompt = '请回复OK';
  const upstream = http.createServer(async (req, res) => {
    const body = JSON.parse(await new Promise((resolve) => { let data = ''; req.on('data', chunk => { data += chunk; }); req.on('end', () => resolve(data)); }));
    assert.equal(body.model, 'mock-model');
    assert.equal(body.max_completion_tokens, 256);
    if (body.messages[0].content === 'fail-me') {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'provider detail must remain private' } }));
      return;
    }
    if (body.messages[0].content === 'refuse') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, refusal: 'I cannot help with that request.' } }] }));
      return;
    }
    assert.equal(body.messages[0].content, prompt);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] }, finish_reason: 'stop' }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-route-test-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'test-upstream', name: 'Mock', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: ['Chat', 'Res', 'Mes'].map(protocol => ({ id: `test-route-${protocol}`, alias: `gateway-fast-${protocol}`, inboundProtocol: protocol, outboundProtocol: 'Chat', upstreamId: 'test-upstream', modelId: 'mock-model', enabled: true })),
    clientKeys: [],
  }));
  const gateway = createGatewayServer({ store, vault });
  const port = await listen(gateway);
  t.after(() => gateway.close());

  const results = await Promise.all(['Chat', 'Res', 'Mes'].map(protocol => gateway.testRoute(`test-route-${protocol}`, prompt)));
  for (const result of results) {
    assert.equal(result.text, 'OK');
    assert.equal(result.status, 200);
    assert.match(result.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(typeof result.durationMs, 'number');
  }
  assert.deepEqual(results.map(result => result.routeAlias), ['gateway-fast-Chat', 'gateway-fast-Res', 'gateway-fast-Mes']);
  const failed = await gateway.testRoute('test-route-Chat', 'fail-me');
  assert.equal(failed.status, 429);
  assert.equal(failed.error, '上游请求被限流，请稍后重试');
  assert.match(failed.requestId, /^[0-9a-f-]{36}$/);
  assert.equal('provider detail must remain private'.includes(failed.error), false);
  const refused = await gateway.testRoute('test-route-Chat', 'refuse');
  assert.equal(refused.text, 'I cannot help with that request.');
  for (let index = 0; index < 5; index += 1) await gateway.testRoute('test-route-Chat', prompt);
  const state = await store.read();
  assert.equal(state.clientKeys.length, 0);
  assert.equal(state.usage.length, 10);
  assert.equal(state.usage[0].modelId, 'mock-model');
  assert.equal(state.usage.find(entry => entry.status === 'failed')?.status, 'failed');
  await assert.rejects(gateway.testRoute('test-route-Chat', prompt), /每分钟最多 10 次/);
  await store.update(config => ({ ...config, routes: config.routes.map(route => route.id === 'test-route-Res' ? { ...route, enabled: false } : route) }));
  await assert.rejects(gateway.testRoute('test-route-Res', prompt), /不存在或已停用/);
  await assert.rejects(gateway.testRoute('missing-route', prompt), /不存在或已停用/);
  await assert.rejects(gateway.testRoute('test-route-Chat', 'x'.repeat(2001)), /1 至 2000/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gateway-fast', messages: [{ role: 'user', content: prompt }] }) })).status, 401);
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

test('gateway forwards a UTF-8 JSON body above 1 MiB with an exact byte Content-Length', async (t) => {
  let upstreamCalls = 0;
  const largeText = '汉'.repeat(600_000);
  const upstream = http.createServer(async (req, res) => {
    upstreamCalls += 1;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    assert.equal(Number(req.headers['content-length']), body.byteLength);
    const parsed = JSON.parse(body.toString('utf8'));
    assert.equal(parsed.messages[0].content, largeText);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'accepted' } }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-large-body-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'cxrg_' + crypto.randomBytes(18).toString('base64url');
  await store.update((config) => ({ ...config,
    upstreams: [{ id: 'large-body-upstream', name: 'Large body', baseUrl: 'http://127.0.0.1:' + upstreamPort, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'large-body-route', alias: 'large-body', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'large-body-upstream', modelId: 'large-body', enabled: true }],
    clientKeys: [{ id: 'large-body-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'large-body' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch('http://127.0.0.1:' + gateway.address().port + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + clientKey },
    body: JSON.stringify({ model: 'large-body', messages: [{ role: 'user', content: largeText }] }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'accepted');
  assert.equal(upstreamCalls, 1);
});

test('gateway classifies allowlisted upstream statuses and sanitizes unknown failures', async (t) => {
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const status = Number(body.metadata?.status);
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'provider-secret-' + status } }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-status-map-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'cxrg_' + crypto.randomBytes(18).toString('base64url');
  await store.update((config) => ({ ...config,
    upstreams: [{ id: 'status-map-upstream', name: 'Status map', baseUrl: 'http://127.0.0.1:' + upstreamPort, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'status-map-route', alias: 'status-map', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'status-map-upstream', modelId: 'status-map', enabled: true }],
    clientKeys: [{ id: 'status-map-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'status-map' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const cases = [[400, 400, 'upstream_http_400'], [413, 413, 'upstream_payload_too_large'], [429, 429, 'upstream_rate_limited'], [500, 502, 'upstream_error'], [599, 502, 'upstream_error']];
  for (const [upstreamStatus, clientStatus, errorCode] of cases) {
    const response = await fetch('http://127.0.0.1:' + gateway.address().port + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + clientKey },
      body: JSON.stringify({ model: 'status-map', metadata: { status: upstreamStatus }, messages: [{ role: 'user', content: 'status' }] }),
    });
    assert.equal(response.status, clientStatus);
    const body = await response.json();
    assert.equal(body.error, errorCode);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(body.message, undefined);
    assert.doesNotMatch(JSON.stringify(body), /provider-secret/);
    const usage = await store.read();
    assert.equal(usage.usage.at(-1).upstreamStatus, upstreamStatus);
  }
});

test('gateway rejects an inbound JSON body above its configured 4 MiB limit before upstream I/O', async (t) => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => {
    upstreamCalls += 1;
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'unexpected' } }] }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-over-limit-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'cxrg_' + crypto.randomBytes(18).toString('base64url');
  await store.update((config) => ({ ...config,
    upstreams: [{ id: 'over-limit-upstream', name: 'Over limit', baseUrl: 'http://127.0.0.1:' + upstreamPort, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'over-limit-route', alias: 'over-limit', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'over-limit-upstream', modelId: 'over-limit', enabled: true }],
    clientKeys: [{ id: 'over-limit-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'over-limit' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxRequestBodyBytes: 4 * 1024 * 1024 });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch('http://127.0.0.1:' + gateway.address().port + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + clientKey },
    body: JSON.stringify({ model: 'over-limit', messages: [{ role: 'user', content: 'x'.repeat(4 * 1024 * 1024) }] }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'request_body_too_large');
  assert.equal(upstreamCalls, 0);
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

test('gateway maps Responses structured output to the supported Messages format', async (t) => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'json-message', content: [{ type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn' }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-reject-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const control = createControlServer({ store, vault, allowUnauthenticated: true });
  await listen(control);
  const base = `http://127.0.0.1:${control.address().port}`;
  const upstreamRecord = await fetch(`${base}/v1/control/upstreams`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Messages', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Mes', allowPrivateNetwork: true }) }).then((r) => r.json());
  await fetch(`${base}/v1/control/routes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'structured', inboundProtocol: 'Res', outboundProtocol: 'Mes', upstreamId: upstreamRecord.id, modelId: 'claude-test' }) });
  const key = await fetch(`${base}/v1/control/client-keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'structured-client' }) }).then((r) => r.json());
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => { gateway.close(); control.close(); });
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` }, body: JSON.stringify({ model: 'structured', text: { format: { type: 'json_schema', name: 'result', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } }, input: 'return json' }) });
  assert.equal(response.status, 200);
  assert.equal(received.output_config.format.type, 'json_schema');
  assert.deepEqual(received.output_config.format.schema, { type: 'object', properties: { ok: { type: 'boolean' } } });
  assert.equal((await response.json()).output[0].content[0].text, '{"ok":true}');
});

test('gateway reports an unsupported request field and conversion direction safely', async (t) => {
  const upstream = http.createServer(() => { throw new Error('must not be called'); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-field-error-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'field-error-client';
  await store.update((config) => ({ ...config,
    upstreams: [{ id: 'field-upstream', name: 'Field', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }],
    routes: [{ id: 'field-route', alias: 'field', inboundProtocol: 'Res', outboundProtocol: 'Chat', upstreamId: 'field-upstream', modelId: 'field-model', enabled: true }],
    clientKeys: [{ id: 'field-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'field' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'field', n: 2, input: 'hello' }) });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json().then(({ error, field, direction }) => ({ error, field, direction })), { error: 'multiple_candidates_unsupported', field: 'n', direction: 'Res->Chat' });
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
    assert.equal(body.input[0].content, 'from messages', JSON.stringify(body));
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
    ['res-mes', 'Res', 'Mes'], ['res-chat', 'Res', 'Chat'], ['mes-res', 'Mes', 'Res'], ['mes-chat', 'Mes', 'Chat'], ['chat-res', 'Chat', 'Res'], ['chat-mes', 'Chat', 'Mes'],
    ['native-res', 'Res', 'Res'], ['native-mes', 'Mes', 'Mes'],
  ].map(([alias, inboundProtocol, outboundProtocol]) => ({ id: `route-${alias}`, alias, inboundProtocol, outboundProtocol, upstreamId, modelId: `model-${alias}`, enabled: true }));
  await store.update((config) => ({ ...config, upstreams: [{ id: upstreamId, name: 'Matrix', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true }], routes, clientKeys: [{ id: 'matrix-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'matrix' }] }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const call = async (pathName, body) => fetch(`${base}${pathName}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify(body) }).then(async (response) => ({ status: response.status, body: await response.json() }));

  const resMes = await call('/v1/responses', { model: 'res-mes', input: 'res to mes' });
  const resChat = await call('/v1/responses', { model: 'res-chat', input: 'res to chat', tool_choice: { type: 'function', name: 'lookup' }, tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }], text: { format: { type: 'json_schema', name: 'answer', schema: { type: 'object' } } } });
  const mesRes = await call('/v1/messages', { model: 'mes-res', messages: [{ role: 'user', content: 'mes to res' }] });
  const mesChat = await call('/v1/messages', { model: 'mes-chat', messages: [{ role: 'user', content: 'mes to chat' }] });
  const chatRes = await call('/v1/chat/completions', { model: 'chat-res', messages: [{ role: 'user', content: 'chat to res' }] });
  const chatMes = await call('/v1/chat/completions', { model: 'chat-mes', messages: [{ role: 'user', content: 'chat to mes' }] });
  assert.equal(resMes.body.output[0].content[0].text, 'reply-mes');
  assert.equal(resChat.body.output[0].content[0].text, 'reply-chat');
  const codexPayload = received.find((item) => item.path === '/v1/chat/completions' && item.body.model === 'model-res-chat').body;
  assert.deepEqual(codexPayload.tool_choice, { type: 'function', function: { name: 'lookup' } });
  assert.equal(codexPayload.response_format.json_schema.name, 'answer');
  assert.equal(codexPayload.tools[0].function.name, 'lookup');
  assert.equal(mesRes.body.content[0].text, 'reply-res');
  assert.equal(mesChat.body.content[0].text, 'reply-chat');
  assert.equal(chatRes.body.choices[0].message.content, 'reply-res');
  assert.equal(chatMes.body.choices[0].message.content, 'reply-mes');

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
  const frames = responsesFrames(await response.text());
  const finished = frames.filter(frame => frame.type === 'response.output_item.done');
  assert.deepEqual(finished.map(({ output_index, item }) => [output_index, item.call_id, JSON.parse(item.arguments)]),
    [[0, 'call-a', { key: 'a' }], [1, 'call-b', { key: 'b' }]]);
  for (const { output_index, item } of finished) {
    const added = frames.find(frame => frame.type === 'response.output_item.added' && frame.output_index === output_index);
    const delta = frames.find(frame => frame.type === 'response.function_call_arguments.delta' && frame.output_index === output_index);
    assert.equal(added.item.id, item.id);
    assert.equal(delta.item_id, item.id);
    assert.equal(delta.delta, item.arguments);
  }
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

test('gateway restores a namespaced Responses tool call after a Chat upstream response', async (t) => {
  const tools = [{ type: 'namespace', name: 'mcp__clock', tools: [{ type: 'function', name: 'get_time', parameters: { type: 'object' } }] }];
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    const targetName = body.tools[0].function.name;
    assert.equal(body.tool_choice.function.name, targetName);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'chat-namespaced', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-gateway-ns', type: 'function', function: { name: targetName, arguments: '{}' } }] } }] }));
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', false, 'What time is it?', {
    tools,
    tool_choice: { type: 'function', name: 'get_time', namespace: 'mcp__clock' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.output[0].type, 'function_call');
  assert.equal(body.output[0].name, 'get_time');
  assert.equal(body.output[0].namespace, 'mcp__clock');
  assert.equal(body.output[0].call_id, 'call-gateway-ns');
});

test('gateway safely rejects server-executed built-ins without echoing submitted tool data', async (t) => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'unexpected upstream call' } }] }));
  });
  const app = await createTimeoutFixture(t, upstream);
  const privateName = 'private-search-backend';
  const privateSchema = { type: 'object', properties: { privateField: { type: 'string', description: 'secret schema detail' } } };
  const privateArgument = 'sensitive query phrase';
  const response = await app.request('Res', false, 'find something', {
    tools: [{ type: 'web_search_preview', name: privateName, execution: 'server', parameters: privateSchema, arguments: privateArgument }],
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'unsupported_feature');
  assert.equal(payload.field, 'tools.type');
  const diagnostics = JSON.stringify(payload);
  assert.doesNotMatch(diagnostics, /private-search-backend|secret schema detail|sensitive query phrase/);
});

test('gateway streams namespaced custom tools back as Responses custom input', async (t) => {
  const patchText = '*** Begin Patch\n*** End Patch';
  const tools = [{ type: 'namespace', name: 'mcp__patch', tools: [{ type: 'custom', name: 'apply_patch', format: { type: 'text' } }] }];
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    const targetName = body.tools[0].function.name;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-gateway-custom', type: 'function', function: { name: targetName, arguments: JSON.stringify({ input: patchText }) } }] }, finish_reason: null }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', true, 'Apply this patch', { tools });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal((body.match(/event: response.completed/g) || []).length, 1);
  assert.match(body, /"type":"custom_tool_call"/);
  assert.match(body, /"name":"apply_patch"/);
  assert.match(body, /"namespace":"mcp__patch"/);
  assert.match(body, /response.custom_tool_call_input.delta/);
  const customDeltaFrame = body.split(/\r?\n\r?\n/).find((frame) => frame.includes('response.custom_tool_call_input.delta'));
  const customDelta = JSON.parse(customDeltaFrame.split(/\r?\n/).find((line) => line.startsWith('data: ')).slice(6));
  assert.equal(customDelta.delta, patchText);
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

test('gateway closes an upstream error body when returning a sanitized failure', async (t) => {
  let closeBody;
  let upstreamResponse;
  const bodyClosed = new Promise(resolve => { closeBody = resolve; });
  const upstream = http.createServer((_req, res) => { upstreamResponse = res; res.on('close', closeBody); res.writeHead(503); res.write('partial'); });
  const upstreamPort = await listen(upstream); t.after(() => { upstreamResponse?.destroy(); upstream.close(); });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-upstream-error-close-'));
  const store = new ConfigStore(path.join(dir, 'config.json')); const vault = new SecretVault(path.join(dir, 'secrets.json'), 'key');
  await store.update(config => ({ ...config, upstreams: [{ id: 'u', baseUrl: `http://127.0.0.1:${upstreamPort}`, trustedPrivateNetwork: true, enabled: true }], routes: [{ id: 'r', alias: 'm', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'u', modelId: 'm', enabled: true }], clientKeys: [{ id: 'k', keyHash: crypto.createHash('sha256').update('client').digest('hex'), enabled: true }] }));
  const gateway = createGatewayServer({ store, vault }); await listen(gateway); t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer client' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hello' }] }) });
  assert.equal(response.status, 502);
  const closed = await Promise.race([bodyClosed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 500))]);
  assert.equal(closed, true, 'upstream response stream must be closed');
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

test('gateway forwards same-protocol Responses bodies larger than the current 4 MiB limit', async (t) => {
  let forwardedText = '';
  const upstream = http.createServer((req, res) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      forwardedText = JSON.parse(data).input[0].content[0].text;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'resp-large', object: 'response', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'large-ok' }] }], status: 'completed' }));
    });
  });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-large-request-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'large-upstream', name: 'Large', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'large-route', alias: 'large', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'large-upstream', modelId: 'large-model', enabled: true }],
    clientKeys: [{ id: 'large-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'large' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const content = 'x'.repeat(5 * 1024 * 1024);
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
    body: JSON.stringify({ model: 'large', input: [{ role: 'user', content: [{ type: 'input_text', text: content }] }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(forwardedText.length, content.length);
  assert.equal((await response.json()).output[0].content[0].text, 'large-ok');
});

test('gateway preserves UTF-8 split across request chunks', async (t) => {
  let forwardedText = '';
  const upstream = http.createServer((req, res) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      forwardedText = JSON.parse(data).input;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'utf8-ok' }] }] }));
    });
  });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-utf8-request-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'utf8-upstream', name: 'UTF8', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'utf8-route', alias: 'utf8', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'utf8-upstream', modelId: 'utf8-model', enabled: true }],
    clientKeys: [{ id: 'utf8-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'utf8' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const input = '前缀🙂中间🚀后缀';
  const body = Buffer.from(JSON.stringify({ model: 'utf8', input }));
  const emojiStart = body.indexOf(Buffer.from('🙂'));
  const response = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: gatewayPort, path: '/v1/responses', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` } }, resolve);
    request.on('error', reject);
    request.write(body.subarray(0, emojiStart + 1));
    request.end(body.subarray(emojiStart + 1));
  });
  response.resume();
  await new Promise(resolve => response.once('end', resolve));
  assert.equal(response.statusCode, 200);
  assert.equal(forwardedText, input);
});
test('gateway uses CXRG_MAX_REQUEST_BODY_BYTES as the environment default', async (t) => {
  const previous = process.env.CXRG_MAX_REQUEST_BODY_BYTES;
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => { upstreamCalls += 1; res.end('unexpected'); });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-env-limit-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'env-upstream', name: 'Env', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'env-route', alias: 'env', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'env-upstream', modelId: 'env-model', enabled: true }],
    clientKeys: [{ id: 'env-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'env' }],
  }));
  try {
    process.env.CXRG_MAX_REQUEST_BODY_BYTES = '1024';
    const gateway = createGatewayServer({ store, vault });
    const gatewayPort = await listen(gateway);
    t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
      body: JSON.stringify({ model: 'env', input: 'x'.repeat(2000) }),
    });
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.error, 'request_body_too_large');
    assert.equal(body.limitBytes, 1024);
    assert.equal(upstreamCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.CXRG_MAX_REQUEST_BODY_BYTES;
    else process.env.CXRG_MAX_REQUEST_BODY_BYTES = previous;
  }
});
test('gateway rejects oversized requests without contacting the upstream', async (t) => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => { upstreamCalls += 1; res.end('unexpected'); });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-request-limit-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'bounded-upstream', name: 'Bounded', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'bounded-route', alias: 'bounded', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'bounded-upstream', modelId: 'bounded-model', enabled: true }],
    clientKeys: [{ id: 'bounded-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'bounded' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxRequestBodyBytes: 1024 });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
    body: JSON.stringify({ model: 'bounded', input: 'x'.repeat(2000) }),
  });
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.equal(body.error, 'request_body_too_large');
  assert.equal(body.limitBytes, 1024);
  assert.ok(body.requestId);
  assert.equal(upstreamCalls, 0);
});
test('gateway rejects chunked bodies above the limit with a readable 413', async (t) => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => { upstreamCalls += 1; res.end('unexpected'); });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-chunked-limit-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'chunked-upstream', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'chunked-route', alias: 'chunked', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'chunked-upstream', modelId: 'chunked-model', enabled: true }],
    clientKeys: [{ id: 'chunked-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), enabled: true }],
  }));
  const gateway = createGatewayServer({ store, vault, maxRequestBodyBytes: 1024 });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const response = await new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}`, 'transfer-encoding': 'chunked' },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write('{"model":"chunked","input":"');
    req.write('x'.repeat(2000));
    req.end('"}');
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'request_body_too_large');
  assert.equal(response.body.limitBytes, 1024);
  assert.equal(upstreamCalls, 0);
});
test('gateway rejects declared oversized bodies before reading them', async (t) => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => { upstreamCalls += 1; res.end('unexpected'); });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-declared-limit-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'declared-upstream', name: 'Declared', baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, protocol: 'Res', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'declared-route', alias: 'declared', inboundProtocol: 'Res', outboundProtocol: 'Res', upstreamId: 'declared-upstream', modelId: 'declared-model', enabled: true }],
    clientKeys: [{ id: 'declared-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'declared' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxRequestBodyBytes: 1024 });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const body = JSON.stringify({ model: 'declared', input: 'x'.repeat(2000) });
  const response = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: gatewayPort, path: '/v1/responses', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}`, 'content-length': String(body.length) } }, resolve);
    request.on('error', reject);
    request.end(body);
  });
  let raw = '';
  response.setEncoding('utf8');
  response.on('data', chunk => { raw += chunk; });
  await new Promise(resolve => response.once('end', resolve));
  const result = JSON.parse(raw);
  assert.equal(response.statusCode, 413);
  assert.equal(result.error, 'request_body_too_large');
  assert.equal(result.limitBytes, 1024);
  assert.equal(upstreamCalls, 0);
});
for (const uploadMode of ['declared', 'chunked']) {
  test('gateway returns a readable 413 before an oversized ' + uploadMode + ' upload completes', async (t) => {
    let upstreamCalls = 0;
    const upstream = http.createServer((_request, response) => {
      upstreamCalls += 1;
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'unexpected' } }] }));
    });
    const fixture = await createTimeoutFixture(t, upstream, { maxRequestBodyBytes: 1024 });
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: fixture.gateway.address().port,
        path: '/v1/responses',
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + fixture.clientKey, ...(uploadMode === 'declared' ? { 'content-length': '2048' } : {}) },
        signal: AbortSignal.timeout(1500),
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, requestIdHeader: response.headers['x-request-id'], body: JSON.parse(body) }));
      });
      t.after(() => request.destroy());
      request.on('error', reject);
      request.flushHeaders();
      if (uploadMode === 'chunked') request.write('x'.repeat(2048));
    });
    assert.equal(result.status, 413);
    assert.equal(result.body.error, 'request_body_too_large');
    assert.equal(result.body.limitBytes, 1024);
    assert.equal(result.body.requestId, result.requestIdHeader);
    assert.equal(upstreamCalls, 0);
  });

}

test('gateway request body limit is configurable and validates explicit bounds', () => {
  const dir = path.join(os.tmpdir(), `cxrg-limit-validation-${crypto.randomUUID()}`);
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  assert.doesNotThrow(() => createGatewayServer({ store, vault }));
  assert.doesNotThrow(() => createGatewayServer({ store, vault, maxRequestBodyBytes: '2048' }));
  for (const invalid of [0, -1, 1.5, 'not-a-number', '', '  ', Number.NaN, Number.POSITIVE_INFINITY, null, true, false, [], {}]) {
    assert.throws(() => createGatewayServer({ store, vault, maxRequestBodyBytes: invalid }), /positive safe integer/);
  }
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

test('gateway enforces the upstream response-header timeout independently', async (t) => {
  const upstream = http.createServer((_req, res) => {
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'late headers' } }] })), 80);
  });
  const app = await createTimeoutFixture(t, upstream, { upstreamHeaderTimeoutMs: 25, maxRequestDurationMs: 500 });
  const response = await app.request('Chat', false);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'upstream_timeout');
  const [entry] = (await app.store.read()).usage;
  assert.equal(entry.errorCode, 'upstream_timeout');
});

test('gateway allows response bodies to outlive the header timeout', async (t) => {
  const payload = JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'slow body completed' } }] });
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    res.write(payload.slice(0, 12));
    setTimeout(() => res.end(payload.slice(12)), 80);
  });
  const app = await createTimeoutFixture(t, upstream, { upstreamHeaderTimeoutMs: 25, maxRequestDurationMs: 500 });
  const response = await app.request('Chat', false);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), JSON.parse(payload));
});

test('gateway testRoute honors the configured client timeout', async (t) => {
  const upstream = http.createServer((_req, res) => {
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'too late' } }] })), 100);
  });
  const app = await createTimeoutFixture(t, upstream, { routeTestTimeoutMs: 40 });
  await assert.rejects(app.gateway.testRoute('deadline-chat-route', 'slow test'), /测试请求超时/);
});

test('gateway enforces the absolute deadline for JSON and streams', async (t) => {
  let closedResponses = 0;
  const upstream = http.createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    res.once('close', () => { if (!res.writableEnded) closedResponses += 1; });
    const content = body.messages?.[0]?.content ?? body.input;
    if (content === 'recover') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'recovered' } }] }));
      return;
    }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
      res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    res.write('{"choices":');
  });
  const app = await createTimeoutFixture(t, upstream, { upstreamHeaderTimeoutMs: 400, maxRequestDurationMs: 100 });

  const jsonTimeout = await app.request('Chat', false);
  assert.equal(jsonTimeout.status, 504);
  assert.equal((await jsonTimeout.json()).error, 'upstream_timeout');
  let entry = (await app.store.read()).usage.at(-1);
  assert.equal(entry.errorCode, 'upstream_timeout');
  assert.ok(entry.durationMs < 300, `expected the 100 ms request deadline, got ${entry.durationMs} ms`);

  const recoveryAfterJson = await app.request('Chat', false, 'recover');
  assert.equal(recoveryAfterJson.status, 200);
  assert.equal((await recoveryAfterJson.json()).choices[0].message.content, 'recovered');

  const nativeStream = await app.request('Chat', true);
  assert.equal(nativeStream.status, 200);
  await nativeStream.arrayBuffer().catch(() => {});
  entry = (await app.store.read()).usage.at(-1);
  assert.equal(entry.errorCode, 'upstream_timeout');
  assert.ok(entry.durationMs < 300, `expected the 100 ms native-stream deadline, got ${entry.durationMs} ms`);

  const convertedStream = await app.request('Res', true);
  assert.equal(convertedStream.status, 200);
  await convertedStream.arrayBuffer().catch(() => {});
  entry = (await app.store.read()).usage.at(-1);
  assert.equal(entry.errorCode, 'upstream_timeout');
  assert.ok(entry.durationMs < 300, `expected the 100 ms converted-stream deadline, got ${entry.durationMs} ms`);

  const recoveryAfterStreams = await app.request('Chat', false, 'recover');
  assert.equal(recoveryAfterStreams.status, 200);
  assert.ok(closedResponses >= 3, 'the Gateway should cancel each timed-out upstream body');
});

test('gateway aborts a stalled response body at the request deadline and releases its concurrency slot', async (t) => {
  let upstreamCalls = 0;
  const upstream = http.createServer((req, res) => {
    upstreamCalls += 1;
    res.setHeader('content-type', 'application/json');
    if (upstreamCalls === 1) {
      res.writeHead(200);
      res.flushHeaders();
      res.write('{"choices":');
      return;
    }
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'recovered' } }] }));
  });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-body-timeout-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'body-timeout-upstream', name: 'Slow body', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'body-timeout-route', alias: 'body-timeout', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'body-timeout-upstream', modelId: 'body-timeout', enabled: true }],
    clientKeys: [{ id: 'body-timeout-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'body-timeout' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxConcurrentRequests: 1, upstreamHeaderTimeoutMs: 500, maxRequestDurationMs: 80 });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const request = () => fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'body-timeout', messages: [{ role: 'user', content: 'hello' }] }), signal: AbortSignal.timeout(1000) });

  const timedOut = await request();
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).error, 'upstream_timeout');
  const recovered = await request();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).choices[0].message.content, 'recovered');
  assert.equal(upstreamCalls, 2);
  const state = await store.read();
  assert.deepEqual(state.usage.map(entry => entry.status), ['failed', 'completed']);
});

test('gateway cancels the active upstream request when its client disconnects', async (t) => {
  let upstreamCalls = 0;
  let markFirstStarted;
  let markFirstClosed;
  const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
  const firstClosed = new Promise(resolve => { markFirstClosed = resolve; });
  const upstream = http.createServer((req, res) => {
    upstreamCalls += 1;
    res.setHeader('content-type', 'application/json');
    if (upstreamCalls === 1) {
      res.writeHead(200);
      res.flushHeaders();
      res.write('{"choices":');
      res.once('close', markFirstClosed);
      markFirstStarted();
      return;
    }
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'after-disconnect' } }] }));
  });
  const upstreamPort = await listen(upstream);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-client-disconnect-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = `cxrg_${crypto.randomBytes(18).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(clientKey).digest('hex');
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'disconnect-upstream', name: 'Disconnect', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'], enabled: true }],
    routes: [{ id: 'disconnect-route', alias: 'disconnect', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: 'disconnect-upstream', modelId: 'disconnect', enabled: true }],
    clientKeys: [{ id: 'disconnect-key', keyHash, scope: [], createdAt: new Date().toISOString(), enabled: true, name: 'disconnect' }],
  }));
  const gateway = createGatewayServer({ store, vault, maxConcurrentRequests: 1, upstreamHeaderTimeoutMs: 10_000 });
  const gatewayPort = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const controller = new AbortController();
  const firstRequest = fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'disconnect', messages: [{ role: 'user', content: 'first' }] }), signal: controller.signal });
  await firstStarted;
  controller.abort();
  await assert.rejects(firstRequest);
  await Promise.race([firstClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('upstream request was not cancelled')), 1000))]);
  let recovered;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    recovered = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` }, body: JSON.stringify({ model: 'disconnect', messages: [{ role: 'user', content: 'second' }] }) });
    if (recovered.status !== 429) break;
    await recovered.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).choices[0].message.content, 'after-disconnect');
  assert.equal(upstreamCalls, 2);
  const cancelled = (await store.read()).usage.find(entry => entry.errorCode === 'request_aborted');
  assert.ok(cancelled);
  assert.equal(cancelled.gatewayStatus, undefined);
  const state = await store.read();
  assert.deepEqual(state.usage.map(entry => entry.status), ['failed', 'completed']);
});

test('gateway restores primary priority when a primary success arrives after concurrent failures open its circuit', async (t) => {
  let resolveFourPrimaryRequests;
  const fourPrimaryRequests = new Promise((resolve) => { resolveFourPrimaryRequests = resolve; });
  const responders = new Map();
  let primaryCalls = 0;
  let backupCalls = 0;
  const primary = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const requestBody = JSON.parse(body);
    const content = requestBody.messages[0].content;
    primaryCalls += 1;
    const concurrentIndex = Number(content.replace('concurrent-', ''));
    if (Number.isInteger(concurrentIndex) && concurrentIndex >= 0 && concurrentIndex < 4) {
      responders.set(concurrentIndex, (status) => replyFailoverResponse(res, status, `primary-${concurrentIndex + 1}`));
      if (responders.size === 4) resolveFourPrimaryRequests();
      return;
    }
    replyFailoverResponse(res, 200, `primary-${primaryCalls}`);
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    backupCalls += 1;
    replyFailoverResponse(res, 200, `backup-${backupCalls}`);
  });
  const app = await createFailoverFixture(t, { primaryHandler: primary, backupHandler: backup });
  const inFlight = Array.from({ length: 4 }, (_, index) => app.request('failover', `concurrent-${index}`));
  void Promise.allSettled(inFlight);
  await fourPrimaryRequests;

  for (let index = 0; index < 3; index += 1) responders.get(index)(502);
  const failures = await Promise.all(inFlight.slice(0, 3));
  for (const response of failures) {
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }

  responders.get(3)(200);
  const lateSuccess = await inFlight[3];
  assert.equal(lateSuccess.status, 200);
  assert.equal((await lateSuccess.json()).choices[0].message.content, 'primary-4');

  const next = await app.request();
  assert.equal(next.status, 200);
  assert.equal((await next.json()).choices[0].message.content, 'primary-5');
  assert.equal(primaryCalls, 5);
  assert.equal(backupCalls, 0);
});

test('gateway ignores an older failure that completes after a newer primary success', async (t) => {
  let resolveFirstPrimaryRequest;
  const firstPrimaryRequest = new Promise((resolve) => { resolveFirstPrimaryRequest = resolve; });
  let respondFirst;
  let primaryCalls = 0;
  let backupCalls = 0;
  const primary = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    primaryCalls += 1;
    if (primaryCalls === 1) {
      respondFirst = (status) => replyFailoverResponse(res, status, 'primary-1');
      resolveFirstPrimaryRequest();
    } else if ([2, 3, 5, 6].includes(primaryCalls)) replyFailoverResponse(res, 502, `primary-${primaryCalls}`);
    else replyFailoverResponse(res, 200, `primary-${primaryCalls}`);
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    backupCalls += 1;
    replyFailoverResponse(res, 200, `backup-${backupCalls}`);
  });
  const app = await createFailoverFixture(t, { primaryHandler: primary, backupHandler: backup });

  const staleFailure = app.request();
  await firstPrimaryRequest;
  for (const response of await Promise.all([app.request(), app.request()])) {
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  const recovery = await app.request();
  assert.equal(recovery.status, 200);
  assert.equal((await recovery.json()).choices[0].message.content, 'primary-4');

  respondFirst(502);
  assert.equal((await staleFailure).status, 502);
  for (const response of await Promise.all([app.request(), app.request()])) {
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  const stillPrimary = await app.request();
  assert.equal(stillPrimary.status, 200);
  assert.equal((await stillPrimary.json()).choices[0].message.content, 'primary-7');
  assert.equal(primaryCalls, 7);
  assert.equal(backupCalls, 0);
});

test('gateway keeps circuit health isolated by route and target', async (t) => {
  let primaryCalls = 0;
  let backupCalls = 0;
  const primary = http.createServer(async (_req, res) => {
    primaryCalls += 1;
    replyFailoverResponse(res, primaryCalls <= 3 ? 502 : 200, `primary-${primaryCalls}`);
  });
  const backup = http.createServer(async (_req, res) => {
    backupCalls += 1;
    replyFailoverResponse(res, 200, `backup-${backupCalls}`);
  });
  const app = await createFailoverFixture(t, {
    primaryHandler: primary,
    backupHandler: backup,
    extraRoutes: [{ id: 'second-route', alias: 'second-route', inboundProtocol: 'Chat', outboundProtocol: 'Chat', targets: [{ upstreamId: 'primary', modelId: 'primary-model' }, { upstreamId: 'backup', modelId: 'backup-model' }], failover: { failureThreshold: 3, statusClasses: [5], cooldownSeconds: 60 }, enabled: true }],
  });

  for (let index = 0; index < 3; index += 1) {
    const failed = await app.request();
    assert.equal(failed.status, 502);
    await failed.arrayBuffer();
  }
  const backupSuccess = await app.request();
  assert.equal((await backupSuccess.json()).choices[0].message.content, 'backup-1');
  const backupStillSelected = await app.request();
  assert.equal((await backupStillSelected.json()).choices[0].message.content, 'backup-2');

  const otherRoute = await app.request('second-route');
  assert.equal((await otherRoute.json()).choices[0].message.content, 'primary-4');
  assert.equal(primaryCalls, 4);
  assert.equal(backupCalls, 2);
});

test('gateway resets target health for routing changes but not display-name changes', async (t) => {
  let primaryCalls = 0;
  let backupCalls = 0;
  let replacementCalls = 0;
  const primary = http.createServer(async (_req, res) => {
    primaryCalls += 1;
    replyFailoverResponse(res, 502, `old-primary-${primaryCalls}`);
  });
  const backup = http.createServer(async (_req, res) => {
    backupCalls += 1;
    replyFailoverResponse(res, 200, `backup-${backupCalls}`);
  });
  const replacement = http.createServer(async (_req, res) => {
    replacementCalls += 1;
    replyFailoverResponse(res, 200, `replacement-${replacementCalls}`);
  });
  const app = await createFailoverFixture(t, { primaryHandler: primary, backupHandler: backup });
  const replacementPort = await listen(replacement);
  t.after(() => { replacement.closeAllConnections(); replacement.close(); });

  for (let index = 0; index < 3; index += 1) {
    const failed = await app.request();
    assert.equal(failed.status, 502);
    await failed.arrayBuffer();
  }
  assert.equal((await (await app.request()).json()).choices[0].message.content, 'backup-1');

  await app.store.update((config) => ({ ...config, upstreams: config.upstreams.map((item) => item.id === 'primary' ? { ...item, name: 'Renamed primary' } : item) }));
  assert.equal((await (await app.request()).json()).choices[0].message.content, 'backup-2');
  assert.equal(primaryCalls, 3);

  await app.store.update((config) => ({ ...config, upstreams: config.upstreams.map((item) => item.id === 'primary' ? { ...item, baseUrl: `http://127.0.0.1:${replacementPort}` } : item) }));
  const updatedPrimary = await app.request();
  assert.equal((await updatedPrimary.json()).choices[0].message.content, 'replacement-1');
  assert.equal(primaryCalls, 3);
  assert.equal(replacementCalls, 1);
  assert.equal(backupCalls, 2);
});

test('gateway stays on backup after the preferred TCP probe fails without reading its credential', async (t) => {
  let currentTime = 1_000_000;
  let modelProbeRequests = 0;
  let primaryRequests = 0;
  const primary = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    if (req.url === '/v1/models') {
      modelProbeRequests += 1;
      return replyFailoverResponse(res, 200, 'unexpected-model-probe');
    }
    primaryRequests += 1;
    replyFailoverResponse(res, 502, 'primary-failed');
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    replyFailoverResponse(res, 200, 'backup');
  });
  const app = await createFailoverFixture(t, {
    primaryHandler: primary,
    backupHandler: backup,
    primaryCredential: 'preferred-secret',
    gatewayOptions: { now: () => currentTime, upstreamHealthProbeTimeoutMs: 100 },
  });
  const originalGet = app.vault.get.bind(app.vault);
  let primaryCredentialReads = 0;
  app.vault.get = async (credentialRef) => {
    if (credentialRef === app.primaryCredentialRef) primaryCredentialReads += 1;
    return originalGet(credentialRef);
  };
  for (let index = 0; index < 3; index += 1) {
    const response = await app.request();
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  assert.equal((await (await app.request()).json()).choices[0].message.content, 'backup');
  await new Promise((resolve, reject) => app.primary.close((error) => error ? reject(error) : resolve()));
  currentTime += 61_000;
  const held = await app.request();
  assert.equal(held.status, 200);
  assert.equal((await held.json()).choices[0].message.content, 'backup');
  assert.equal(primaryCredentialReads, 3);
  assert.equal(modelProbeRequests, 0);
  assert.equal(primaryRequests, 3);
});

test('gateway fails back after TCP connectivity without sending an HTTP health request', async (t) => {
  let currentTime = 2_000_000;
  let modelProbeRequests = 0;
  let primaryRequests = 0;
  const primary = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    if (req.url === '/v1/models') {
      modelProbeRequests += 1;
      return replyFailoverResponse(res, 503, 'API health endpoint unavailable');
    }
    primaryRequests += 1;
    replyFailoverResponse(res, primaryRequests <= 3 ? 502 : 200, primaryRequests <= 3 ? 'primary-failed' : 'primary-recovered');
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    replyFailoverResponse(res, 200, 'backup');
  });
  const app = await createFailoverFixture(t, {
    primaryHandler: primary,
    backupHandler: backup,
    primaryCredential: 'preferred-secret',
    gatewayOptions: { now: () => currentTime, upstreamHealthProbeTimeoutMs: 100 },
  });
  const originalGet = app.vault.get.bind(app.vault);
  let primaryCredentialReads = 0;
  app.vault.get = async (credentialRef) => {
    if (credentialRef === app.primaryCredentialRef) primaryCredentialReads += 1;
    return originalGet(credentialRef);
  };
  for (let index = 0; index < 3; index += 1) {
    const response = await app.request();
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  assert.equal((await (await app.request()).json()).choices[0].message.content, 'backup');
  currentTime += 61_000;
  const recovered = await app.request();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).choices[0].message.content, 'primary-recovered');
  assert.equal(modelProbeRequests, 0);
  assert.equal(primaryCredentialReads, 4);
  assert.equal(primaryRequests, 4);
});

test('gateway shares one in-flight transport check across concurrent post-cooldown requests', async (t) => {
  let currentTime = 3_000_000;
  let releaseProbe;
  const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
  let connectivityChecks = 0;
  let modelProbeRequests = 0;
  let primaryRequests = 0;
  const primary = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    if (req.url === '/v1/models') {
      modelProbeRequests += 1;
      return replyFailoverResponse(res, 200, 'probe-ok');
    }
    primaryRequests += 1;
    replyFailoverResponse(res, primaryRequests <= 3 ? 502 : 200, primaryRequests <= 3 ? 'primary-failed' : 'primary-recovered');
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    replyFailoverResponse(res, 200, 'backup');
  });
  const app = await createFailoverFixture(t, {
    primaryHandler: primary,
    backupHandler: backup,
    primaryCredential: 'preferred-secret',
    gatewayOptions: {
      now: () => currentTime,
      upstreamHealthProbeTimeoutMs: 1000,
      connectivityCheck: async (baseUrl, addresses, timeoutMs, signal) => {
        connectivityChecks += 1;
        assert.equal(new URL(baseUrl).hostname, '127.0.0.1');
        assert.deepEqual(addresses, ['127.0.0.1']);
        assert.equal(timeoutMs, 1000);
        assert.equal(signal instanceof AbortSignal, true);
        await probeGate;
        return true;
      },
    },
  });
  for (let index = 0; index < 3; index += 1) {
    const response = await app.request();
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  currentTime += 61_000;
  const first = app.request('failover', 'concurrent-probe-1');
  const second = app.request('failover', 'concurrent-probe-2');
  for (let attempt = 0; attempt < 20 && connectivityChecks === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const checksBeforeRelease = connectivityChecks;
  releaseProbe();
  const responses = await Promise.all([first, second]);
  assert.deepEqual(await Promise.all(responses.map((response) => response.json().then((body) => body.choices[0].message.content))), ['primary-recovered', 'primary-recovered']);
  assert.equal(checksBeforeRelease, 1);
  assert.equal(connectivityChecks, 1);
  assert.equal(modelProbeRequests, 0);
  assert.equal(primaryRequests, 5);
});

test('gateway bounds a stalled post-cooldown transport check and stays on backup', async (t) => {
  let currentTime = 4_000_000;
  let connectivityChecks = 0;
  let modelProbeRequests = 0;
  let primaryRequests = 0;
  const primary = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    if (req.url === '/v1/models') {
      modelProbeRequests += 1;
      return replyFailoverResponse(res, 200, 'unexpected-model-probe');
    }
    primaryRequests += 1;
    replyFailoverResponse(res, primaryRequests <= 3 ? 502 : 200, primaryRequests <= 3 ? 'primary-failed' : 'primary-recovered');
  });
  const backup = http.createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request body */ }
    replyFailoverResponse(res, 200, 'backup');
  });
  const app = await createFailoverFixture(t, {
    primaryHandler: primary,
    backupHandler: backup,
    gatewayOptions: {
      now: () => currentTime,
      upstreamHealthProbeTimeoutMs: 40,
      connectivityCheck: () => {
        connectivityChecks += 1;
        return new Promise(() => {});
      },
    },
  });
  for (let index = 0; index < 3; index += 1) {
    const response = await app.request();
    assert.equal(response.status, 502);
    await response.arrayBuffer();
  }
  currentTime += 61_000;
  const startedAt = Date.now();
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'backup');
  assert.equal(connectivityChecks, 1);
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(modelProbeRequests, 0);
  assert.equal(primaryRequests, 3);
});

test('gateway normalizes a reset upstream response into a readable sanitized error', async (t) => {
  const upstream = http.createServer((_req, res) => { res.socket?.destroy(); });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());
  const backup = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'backup' } }] }));
  });
  const backupPort = await listen(backup);
  t.after(() => backup.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-upstream-reset-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'secrets.json'), 'test-master-key');
  const clientKey = 'reset-client';
  await store.update((config) => ({ ...config,
    upstreams: [
      { id: 'reset-upstream', name: 'Reset', baseUrl: `http://127.0.0.1:${upstreamPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true },
      { id: 'reset-backup', name: 'Backup', baseUrl: `http://127.0.0.1:${backupPort}`, protocol: 'Chat', trustedPrivateNetwork: true, enabled: true },
    ],
    routes: [{ id: 'reset-route', alias: 'reset', inboundProtocol: 'Chat', outboundProtocol: 'Chat', targets: [{ upstreamId: 'reset-upstream', modelId: 'reset-model' }, { upstreamId: 'reset-backup', modelId: 'backup-model' }], failover: { failureThreshold: 1, statusClasses: [5], cooldownSeconds: 60 }, enabled: true }],
    clientKeys: [{ id: 'reset-key', keyHash: crypto.createHash('sha256').update(clientKey).digest('hex'), createdAt: new Date().toISOString(), enabled: true, name: 'reset' }],
  }));
  const gateway = createGatewayServer({ store, vault });
  await listen(gateway);
  t.after(() => gateway.close());
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
    body: JSON.stringify({ model: 'reset', messages: [{ role: 'user', content: 'hello' }] }),
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_connection_reset');
  assert.equal((await store.read()).usage.at(-1).errorCode, 'upstream_connection_reset');
  const recovered = await fetch(`http://127.0.0.1:${gateway.address().port}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clientKey}` },
    body: JSON.stringify({ model: 'reset', messages: [{ role: 'user', content: 'hello again' }] }),
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).choices[0].message.content, 'backup');
});

function responsesFrames(wire) {
  return wire.split(/\r?\n\r?\n/).filter(frame => frame.trim()).map(frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    return data && data !== '[DONE]' ? JSON.parse(data) : undefined;
  }).filter(Boolean);
}

async function waitForUsage(store, count = 1) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const usage = (await store.read()).usage || [];
    if (usage.length >= count) return usage.at(-1);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Expected request log was not persisted');
}

test('Chat to Responses streams complete assistant text and function output items', async t => {
  let posted;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    posted = { path: req.url, body: JSON.parse(Buffer.concat(chunks)) };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chat = (delta, finish_reason = null) => ({ choices: [{ index: 0, delta, finish_reason }] });
    const chunksOut = [
      chat({ role: 'assistant', reasoning_content: 'fixture reasoning' }),
      chat({ content: '已找到' }),
      chat({ content: '文档', tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: 'lookup', arguments: '{"key":' } }] }),
      chat({ tool_calls: [{ index: 0, function: { arguments: '"doc"}' } }] }, 'tool_calls'),
      { choices: [], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } },
    ];
    res.end(chunksOut.map(chunk => 'data: ' + JSON.stringify(chunk) + '\n\n').join('') + 'data: [DONE]\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', true, 'find doc', {
    tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }],
  });
  assert.equal(response.status, 200);
  const wire = await response.text();
  assert.equal(posted.path, '/v1/chat/completions');
  assert.equal(posted.body.tools[0].function.name, 'lookup');
  assert.equal(posted.body.messages.at(-1).content, 'find doc');
  assert.doesNotMatch(wire, /fixture reasoning/);
  const frames = responsesFrames(wire);
  const created = frames[0];
  const completed = frames.at(-1);
  assert.equal(created.type, 'response.created');
  assert.equal(completed.type, 'response.completed');
  assert.equal(completed.response.id, created.response.id);
  assert.deepEqual(frames.map(frame => frame.sequence_number), frames.map((_, index) => index));
  const opened = frames.filter(frame => frame.type === 'response.output_item.added');
  const closed = frames.filter(frame => frame.type === 'response.output_item.done');
  const message = closed.find(frame => frame.item.type === 'message');
  const call = closed.find(frame => frame.item.type === 'function_call');
  assert.ok(message);
  assert.ok(call);
  assert.equal(message.item.content[0].text, '已找到文档');
  assert.equal(call.item.call_id, 'call_fixture');
  assert.equal(call.item.name, 'lookup');
  assert.equal(call.item.arguments, '{"key":"doc"}');
  assert.notEqual(message.output_index, call.output_index);
  assert.equal(opened.find(frame => frame.output_index === message.output_index).item.id, message.item.id);
  assert.equal(opened.find(frame => frame.output_index === call.output_index).item.id, call.item.id);
  const textDeltas = frames.filter(frame => frame.type === 'response.output_text.delta');
  assert.equal(textDeltas.map(frame => frame.delta).join(''), '已找到文档');
  assert.ok(textDeltas.every(frame => frame.item_id === message.item.id && frame.output_index === message.output_index && frame.content_index === 0));
  const argumentDeltas = frames.filter(frame => frame.type === 'response.function_call_arguments.delta');
  assert.equal(argumentDeltas.map(frame => frame.delta).join(''), call.item.arguments);
  assert.ok(argumentDeltas.every(frame => frame.item_id === call.item.id && frame.output_index === call.output_index));
  assert.ok(frames.some(frame => frame.type === 'response.content_part.added' && frame.item_id === message.item.id));
  assert.ok(frames.some(frame => frame.type === 'response.output_text.done' && frame.item_id === message.item.id && frame.text === '已找到文档'));
  assert.ok(frames.some(frame => frame.type === 'response.content_part.done' && frame.item_id === message.item.id));
  assert.ok(frames.some(frame => frame.type === 'response.function_call_arguments.done' && frame.item_id === call.item.id));
  assert.deepEqual(completed.response.output, closed.map(frame => frame.item));
  assert.equal(completed.response.usage.output_tokens, 4);
  assert.equal((await waitForUsage(app.store)).status, 'completed');
});

test('Chat to Responses with only reasoning and usage fails before a downstream completion', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"reasoning_content":"fixture private reasoning"}}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":4,"total_tokens":12}}\n\n'
      + 'data: [DONE]\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', true);
  const wire = await response.text();
  assert.equal(response.status, 502, wire);
  assert.doesNotMatch(wire, /response\.completed|fixture private reasoning/);
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.equal(log.gatewayStatus, 502);
  assert.equal(log.upstreamStatus, 200);
  assert.equal(log.tokens.output, 4);
});

function messagesEvent(type, fields = {}) {
  return 'event: ' + type + '\ndata: ' + JSON.stringify({ type, ...fields }) + '\n\n';
}

test('Responses round trip through Messages preserves stream text, tools, and usage', async t => {
  let posted;
  const schema = { type: 'object', properties: { key: { type: 'string' } } };
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    posted = { path: req.url, body };
    if (body.tool_choice?.type !== 'auto') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      messagesEvent('message_start', { message: { id: 'msg_fixture', content: [], usage: { input_tokens: 8, output_tokens: 1 } } })
      + messagesEvent('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      + messagesEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Found ' } })
      + messagesEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'doc' } })
      + messagesEvent('content_block_stop', { index: 0 })
      + messagesEvent('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_fixture', name: 'lookup', input: {} } })
      + messagesEvent('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"key":' } })
      + messagesEvent('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '"doc"}' } })
      + messagesEvent('content_block_stop', { index: 1 })
      + messagesEvent('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } })
      + messagesEvent('message_stop'),
    );
  });
  const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', 'Mes');
  const response = await app.request('Res', true, 'Find doc', {
    instructions: 'Be concise', tool_choice: 'auto', max_output_tokens: 64,
    tools: [{ type: 'function', name: 'lookup', parameters: schema }],
  });
  const wire = await response.text();
  assert.equal(posted.path, '/v1/messages');
  assert.deepEqual(posted.body, {
    model: 'mock-mes', stream: true, messages: [{ role: 'user', content: 'Find doc' }], system: 'Be concise',
    max_tokens: 64, tools: [{ name: 'lookup', input_schema: schema }], tool_choice: { type: 'auto' },
  });
  assert.equal(response.status, 200, wire);
  const frames = responsesFrames(wire);
  assert.equal(frames[0].type, 'response.created');
  assert.deepEqual(frames.map(frame => frame.sequence_number), frames.map((_, index) => index));
  const closed = frames.filter(frame => frame.type === 'response.output_item.done');
  assert.deepEqual(closed.map(frame => frame.output_index), [0, 1]);
  assert.deepEqual(closed.map(frame => frame.item.type), ['message', 'function_call']);
  for (const { output_index, item } of closed) {
    assert.equal(frames.find(frame => frame.type === 'response.output_item.added' && frame.output_index === output_index).item.id, item.id);
  }
  const [message, call] = closed.map(frame => frame.item);
  const text = frames.filter(frame => frame.type === 'response.output_text.delta');
  const args = frames.filter(frame => frame.type === 'response.function_call_arguments.delta');
  assert.ok(text.every(frame => frame.item_id === message.id && frame.output_index === 0 && frame.content_index === 0));
  assert.ok(args.every(frame => frame.item_id === call.id && frame.output_index === 1));
  assert.equal(text.map(frame => frame.delta).join(''), 'Found doc');
  assert.equal(message.content[0].text, 'Found doc');
  assert.equal(call.call_id, 'toolu_fixture');
  assert.equal(call.name, 'lookup');
  assert.equal(args.map(frame => frame.delta).join(''), call.arguments);
  assert.deepEqual(JSON.parse(call.arguments), { key: 'doc' });
  assert.equal(frames.at(-1).type, 'response.completed');
  assert.equal(frames.at(-1).response.id, frames[0].response.id);
  assert.deepEqual(frames.at(-1).response.output, [message, call]);
  assert.equal(frames.at(-1).response.usage.output_tokens, 6);
  assert.equal((await waitForUsage(app.store)).status, 'completed');
});

for (const protocol of ['Chat', 'Mes']) {
  test(`Responses round trip through ${protocol} retains text next to a non-streaming tool call`, async t => {
    const upstream = http.createServer((_req, res) => {
      const chat = { choices: [{ finish_reason: 'tool_calls', message: {
        content: 'Looking up doc', tool_calls: [{ id: 'call_json', function: { name: 'lookup', arguments: '{"key":"doc"}' } }],
      } }] };
      const mes = { stop_reason: 'tool_use', content: [
        { type: 'text', text: 'Looking up doc' }, { type: 'tool_use', id: 'call_json', name: 'lookup', input: { key: 'doc' } },
      ] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(protocol === 'Chat' ? chat : mes));
    });
    const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', protocol);
    const response = await app.request('Res', false, 'Find doc', {
      tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }],
    });
    assert.equal(response.status, 200);
    const { output } = await response.json();
    assert.deepEqual(output.map(item => item.type), ['message', 'function_call']);
    assert.equal(output[0].content[0].text, 'Looking up doc');
    assert.deepEqual([output[1].call_id, output[1].name, JSON.parse(output[1].arguments)], ['call_json', 'lookup', { key: 'doc' }]);
  });

  test(`Responses follow-up through ${protocol} groups assistant text and parallel calls before their results`, async t => {
    let body;
    const upstream = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(protocol === 'Chat'
        ? { choices: [{ message: { content: 'Done' } }] }
        : { content: [{ type: 'text', text: 'Done' }] }));
    });
    const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', protocol);
    const keys = ['a', 'b'];
    const response = await app.request('Res', false, [
      { role: 'user', content: 'Find both' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Looking up both' }] },
      ...keys.map(key => ({ type: 'function_call', name: 'lookup', call_id: 'call_' + key, arguments: JSON.stringify({ key }) })),
      ...keys.map(key => ({ type: 'function_call_output', call_id: 'call_' + key, output: 'value ' + key })),
    ]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).output[0].content[0].text, 'Done');
    if (protocol === 'Chat') {
      assert.deepEqual(body.messages.map(message => message.role), ['user', 'assistant', 'tool', 'tool']);
      assert.equal(body.messages[1].content, 'Looking up both');
      assert.deepEqual(body.messages[1].tool_calls.map(call => call.id), ['call_a', 'call_b']);
      assert.deepEqual(body.messages.slice(2).map(result => result.tool_call_id), ['call_a', 'call_b']);
    } else {
      assert.deepEqual(body.messages.map(message => message.role), ['user', 'assistant', 'user']);
      assert.deepEqual(body.messages[1].content, [
        { type: 'text', text: 'Looking up both' },
        ...keys.map(key => ({ type: 'tool_use', id: 'call_' + key, name: 'lookup', input: { key } })),
      ]);
      assert.deepEqual(body.messages[2].content.map(result => result.tool_use_id), ['call_a', 'call_b']);
    }
  });
}

test('Messages to Responses rejects a thinking-only stream with HTTP 502', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(messagesEvent('message_start', { message: { usage: { input_tokens: 8, output_tokens: 1 } } })
      + messagesEvent('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } })
      + messagesEvent('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'private fixture thought' } })
      + messagesEvent('content_block_stop', { index: 0 })
      + messagesEvent('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } })
      + messagesEvent('message_stop'));
  });
  const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', 'Mes');
  const response = await app.request('Res', true);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private fixture thought|response\.completed/);
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.equal(log.upstreamStatus, 200);
});

test('Messages SSE error cannot complete a Responses stream after partial text', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(messagesEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'partial' } })
      + messagesEvent('error', { error: { type: 'overloaded_error', message: 'private fixture error' } })
      + messagesEvent('message_stop'));
  });
  const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', 'Mes');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  const wire = await response.text();
  assert.doesNotMatch(wire, /private fixture error|response\.completed/);
  const frames = responsesFrames(wire);
  assert.equal(frames.find(frame => frame.type === 'response.output_text.delta').delta, 'partial');
  assert.equal(frames.at(-1).type, 'error');
  assert.deepEqual(frames.map(frame => frame.sequence_number), frames.map((_, index) => index));
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.equal(log.gatewayStatus, 200);
  assert.equal(log.upstreamStatus, 200);
});

test('Messages end of stream without message_stop fails after partial text', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(messagesEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'partial' } }));
  });
  const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', 'Mes');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  assert.equal(responsesFrames(await response.text()).at(-1).type, 'error');
  assert.equal((await waitForUsage(app.store)).status, 'failed');
});

for (const protocol of ['Chat', 'Mes']) {
  test(`Responses reports incomplete when ${protocol} stops at its output limit`, async t => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(protocol === 'Chat'
        ? 'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'
        : messagesEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'partial' } })
          + messagesEvent('message_delta', { delta: { stop_reason: 'max_tokens' } })
          + messagesEvent('message_stop'));
    });
    const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', protocol);
    const response = await app.request('Res', true);
    assert.equal(response.status, 200);
    const frames = responsesFrames(await response.text());
    assert.equal(frames.at(-1).type, 'response.incomplete');
    assert.equal(frames.at(-1).response.status, 'incomplete');
    assert.equal(frames.at(-1).response.incomplete_details.reason, 'max_output_tokens');
    assert.equal(frames.at(-1).response.output[0].content[0].text, 'partial');
    assert.equal(frames.at(-1).response.output[0].status, 'incomplete');
    assert.ok(!frames.some(frame => frame.type === 'response.completed'));
  });
}

test('Messages tool use without argument deltas returns an empty object to Responses', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(messagesEvent('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_empty', name: 'lookup', input: {} } })
      + messagesEvent('content_block_stop', { index: 0 })
      + messagesEvent('message_delta', { delta: { stop_reason: 'tool_use' } })
      + messagesEvent('message_stop'));
  });
  const app = await createTimeoutFixture(t, upstream, {}, '127.0.0.1', 'Mes');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  const frames = responsesFrames(await response.text());
  assert.equal(frames.at(-1).response.output[0].arguments, '{}');
  assert.equal(frames.find(frame => frame.type === 'response.function_call_arguments.done').arguments, '{}');
});

test('Responses stream reset before headers stays a sanitized 502 without retry', async t => {
  let attempts = 0;
  let fallbackAttempts = 0;
  const upstream = http.createServer((_req, res) => { attempts += 1; res.destroy(); });
  const app = await createTimeoutFixture(t, upstream, {
    dnsLookup: async hostname => hostname === 'dual-reset.test'
      ? [{ address: '127.0.0.1', family: 4 }, { address: '127.0.0.2', family: 4 }]
      : [],
  });
  const fallback = http.createServer(async (req, res) => {
    fallbackAttempts += 1;
    for await (const _chunk of req) { /* A fallback here would replay an ambiguous model request. */ }
    replyFailoverResponse(res, 200, 'must-not-retry-after-reset');
  });
  await new Promise((resolve, reject) => fallback.listen(upstream.address().port, '127.0.0.2', resolve).once('error', reject));
  t.after(() => { fallback.closeAllConnections(); fallback.close(); });
  await app.store.update(config => ({ ...config, upstreams: config.upstreams.map(item => ({ ...item, baseUrl: `http://dual-reset.test:${upstream.address().port}`, approvedAddresses: ['127.0.0.1', '127.0.0.2'] })) }));
  const response = await app.request('Res', true, 'private-reset-prompt');
  assert.equal(response.status, 502);
  const error = await response.json();
  assert.equal(error.error, 'upstream_connection_reset');
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.equal(log.gatewayStatus, 502);
  assert.equal(log.upstreamStatus, undefined);
  assert.equal(log.streamFailurePhase, 'upstream_headers');
  assert.equal(attempts, 1);
  assert.equal(fallbackAttempts, 0);
  assert.doesNotMatch(JSON.stringify(log), /private-reset-prompt|Bearer|socket hang up/);
});

for (const converted of [false, true]) {
  test(`Responses ${converted ? 'converted' : 'passthrough'} stream reset after output ends with a sequenced error, not a second HTTP 502`, async t => {
    let upstreamResponse;
    let attempts = 0;
    const upstream = http.createServer((_req, res) => {
      attempts += 1;
      upstreamResponse = res;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(converted
        ? 'data: {"choices":[{"delta":{"content":"private-partial-output"}}]}\n\n'
        : 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":4,"delta":"private-partial-output"}\n\n');
    });
    const app = await createTimeoutFixture(t, upstream);
    if (!converted) await app.store.update(config => ({ ...config, routes: config.routes.map(route => route.inboundProtocol === 'Res' ? { ...route, outboundProtocol: 'Res' } : route) }));
    const response = await app.request('Res', true, 'private-reset-prompt');
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    let wire = Buffer.from(first.value).toString('utf8');
    upstreamResponse.destroy();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      wire += Buffer.from(chunk.value).toString('utf8');
    }
    const frames = responsesFrames(wire);
    const terminal = frames.at(-1);
    assert.equal(terminal.type, 'error');
    assert.equal(terminal.code, 'upstream_connection_reset');
    assert.equal(terminal.param, null);
    assert.equal(typeof terminal.message, 'string');
    assert.ok(Number.isSafeInteger(terminal.sequence_number));
    assert.ok(terminal.sequence_number > frames[0].sequence_number);
    assert.equal(frames.filter(frame => frame.type === 'error').length, 1);
    assert.equal(frames.some(frame => frame.type === 'response.completed'), false);
    const log = await waitForUsage(app.store);
    assert.equal(log.status, 'failed');
    assert.equal(log.errorCode, 'upstream_connection_reset');
    assert.equal(log.upstreamStatus, 200);
    assert.equal(log.gatewayStatus, 200);
    assert.equal(log.streamFailurePhase, 'upstream_body');
    assert.ok(log.firstTokenMs >= 0);
    assert.ok(Number.isFinite(log.upstreamHeadersMs));
    assert.ok(Number.isFinite(log.upstreamFirstByteMs));
    assert.ok(Number.isFinite(log.upstreamBodyMs));
    assert.ok(log.upstreamChunkCount >= 1);
    assert.ok(Number.isFinite(log.gatewayProcessingMs));
    assert.equal(attempts, 1);
    assert.doesNotMatch(JSON.stringify(log), /private-reset-prompt|private-partial-output|Bearer|socket hang up/);
  });
}

test('Responses client disconnect stops upstream and records a bounded failure phase', async t => {
  let closed;
  const upstreamClosed = new Promise(resolve => { closed = resolve; });
  const upstream = http.createServer((_req, res) => {
    res.on('close', closed);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":1,"delta":"partial"}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => route.inboundProtocol === 'Res' ? { ...route, outboundProtocol: 'Res' } : route) }));
  const response = await app.request('Res', true);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await upstreamClosed;
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.equal(log.upstreamStatus, 200);
  assert.equal(log.gatewayStatus, 200);
  assert.equal(log.streamFailurePhase, 'downstream_closed');
});
test('Gateway forwards Codex tool search, structural tools and resumed namespace history through local Chat', async t => {
  let received = [];
  const upstream = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); received.push(body);
    const search = body.tools?.find(tool => tool.function?.parameters?.properties?.query?.type === 'string');
    if (!body.stream) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'chat-search-integration', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'search-integration-1', type: 'function', function: { name: search?.function.name, arguments: '{"query":"clock","limit":2}' } }] } }] }));
    } else {
      const loaded = body.tools.find(tool => tool.function?.name.includes('get_time'));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'loaded-call-1', type: 'function', function: { name: loaded?.function.name, arguments: '{}' } }] } }] }) + '\n\n' + 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');
    }
  });
  const app = await createTimeoutFixture(t, upstream);
  const initialInput = [
    { role: 'user', content: 'private-codex-tool-prompt' },
    { type: 'additional_tools', role: 'developer', tools: [{ type: 'namespace', name: 'mcp__patch', tools: [{ type: 'custom', name: 'apply_patch', format: { type: 'text' } }] }] },
  ];
  const response = await app.request('Res', false, initialInput, { tools: [{ type: 'tool_search' }] });
  assert.equal(response.status, 200);
  const result = await response.json();
  const searchCall = result.output[0];
  assert.equal(searchCall.type, 'tool_search_call');
  assert.equal(searchCall.call_id, 'search-integration-1');
  assert.equal(searchCall.execution, 'client');
  assert.deepEqual(searchCall.arguments, { query: 'clock', limit: 2 });
  assert.equal(received[0].messages.length, 1);
  assert.equal(received[0].tools.length, 2);
  assert.equal(received[0].tools.every(tool => tool.type === 'function'), true);

  const loaded = [{ type: 'namespace', name: 'mcp__clock', tools: [{ type: 'function', name: 'get_time', parameters: { type: 'object', properties: {} } }] }];
  const resumed = await app.request('Res', true, [
    ...initialInput,
    searchCall,
    { type: 'tool_search_output', call_id: 'search-integration-1', execution: 'client', status: 'completed', tools: loaded },
  ], { tools: [{ type: 'tool_search' }] });
  assert.equal(resumed.status, 200);
  const frames = responsesFrames(await resumed.text());
  const call = frames.find(frame => frame.type === 'response.output_item.added' && frame.item?.call_id === 'loaded-call-1').item;
  assert.equal(call.type, 'function_call');
  assert.equal(call.name, 'get_time');
  assert.equal(call.namespace, 'mcp__clock');
  assert.equal(frames.filter(frame => frame.type === 'response.completed').length, 1);
  assert.deepEqual(frames.map(frame => frame.sequence_number), frames.map((_frame, index) => index));
  const resumedChat = received[1];
  assert.equal(resumedChat.messages[1].tool_calls[0].id, 'search-integration-1');
  assert.equal(resumedChat.messages[2].role, 'tool');
  assert.equal(resumedChat.messages[2].tool_call_id, 'search-integration-1');
  assert.deepEqual(JSON.parse(resumedChat.messages[2].content), { status: 'completed', tools: loaded });
  const log = await waitForUsage(app.store, 2);
  assert.equal(log.status, 'completed');
  assert.doesNotMatch(JSON.stringify((await app.store.read()).usage), /private-codex-tool-prompt|apply_patch|get_time|clock/);
  assert.equal(received.length, 2);
});
test('Gateway records invalid upstream tool-search arguments as one failed request, never success', async t => {
  const upstream = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'bad-search', type: 'function', function: { name: 'tool_search', arguments: 'private-invalid-json' } }] } }] }));
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', false, 'private-prompt', { tools: [{ type: 'tool_search' }] });
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.doesNotMatch(body, /private-invalid-json|private-prompt/);
  await waitForUsage(app.store);
  const logs = (await app.store.read()).usage;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'failed');
  assert.equal(logs[0].upstreamStatus, 200);
  assert.equal(logs[0].gatewayStatus, 502);
  assert.doesNotMatch(JSON.stringify(logs), /private-invalid-json|private-prompt/);
});
test('Responses reset after upstream headers but before downstream output returns a real 502', async t => {
  let resetUpstream;
  let notifyHeaders;
  const headersSent = new Promise(resolve => { notifyHeaders = resolve; });
  const upstream = http.createServer((_req, res) => {
    resetUpstream = res;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.flushHeaders();
    notifyHeaders();
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => route.inboundProtocol === 'Res' ? { ...route, outboundProtocol: 'Res' } : route) }));
  const pending = app.request('Res', true);
  await headersSent;
  // Wait one turn so the Gateway can receive upstream headers without any body.
  await new Promise(resolve => setTimeout(resolve, 20));
  resetUpstream.destroy();
  const response = await pending;
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_connection_reset');
  const log = await waitForUsage(app.store);
  assert.equal(log.upstreamStatus, 200);
  assert.equal(log.gatewayStatus, 502);
  assert.equal(log.streamFailurePhase, 'upstream_body');
  assert.equal(log.firstTokenMs, undefined);
});
test('converted search stream EOF without a completion marker fails instead of dropping buffered calls', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const payload = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'eof-search', function: { name: 'tool_search', arguments: JSON.stringify({ query: 'clock' }) } }] } }] };
    res.end(`data: ${JSON.stringify(payload)}\n\n`);
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', true, 'find tool', { tools: [{ type: 'tool_search' }] });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'upstream_error');
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
});

test('converted completion waits for transport EOF and never precedes a reset error', async t => {
  let responseToReset;
  const upstream = http.createServer((_req, res) => {
    responseToReset = res;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  const response = await app.request('Res', true);
  const reader = response.body.getReader();
  const first = await reader.read();
  let wire = Buffer.from(first.value).toString();
  responseToReset.destroy();
  while (true) { const chunk = await reader.read(); if (chunk.done) break; wire += Buffer.from(chunk.value).toString(); }
  const frames = responsesFrames(wire);
  assert.equal(frames.filter(frame => frame.type === 'response.completed').length, 0);
  assert.equal(frames.filter(frame => frame.type === 'error').length, 1);
  assert.equal((await waitForUsage(app.store)).status, 'failed');
});

for (const incompleteDelimiter of [false, true]) {
  test(`passthrough sequence tracking survives ${incompleteDelimiter ? 'a valid tail without blank line' : 'an SSE frame larger than the metrics cap'}`, async t => {
    let responseToReset;
    const wireEvent = 'event: response.output_text.delta\ndata: ' + JSON.stringify({ type: 'response.output_text.delta', sequence_number: 40, delta: incompleteDelimiter ? 'tail' : 'x'.repeat(270 * 1024) }) + (incompleteDelimiter ? '' : '\n\n');
    const upstream = http.createServer((_req, res) => {
      responseToReset = res;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write((incompleteDelimiter ? ': ready\n\n' : '') + wireEvent);
    });
    const app = await createTimeoutFixture(t, upstream);
    await app.store.update(config => ({ ...config, routes: config.routes.map(route => route.inboundProtocol === 'Res' ? { ...route, outboundProtocol: 'Res' } : route) }));
    const response = await app.request('Res', true);
    const reader = response.body.getReader();
    let wire = '';
    do { const chunk = await reader.read(); assert.equal(chunk.done, false); wire += Buffer.from(chunk.value).toString(); } while (!incompleteDelimiter && Buffer.byteLength(wire) < Buffer.byteLength(wireEvent));
    responseToReset.destroy();
    while (true) { const chunk = await reader.read(); if (chunk.done) break; wire += Buffer.from(chunk.value).toString(); }
    const frames = responsesFrames(wire);
    assert.equal(frames[0].sequence_number, 40);
    assert.equal(frames.at(-1).type, 'error');
    assert.equal(frames.at(-1).sequence_number, 41);
  });
}

test('client cancellation does not penalize a healthy upstream or switch the next request to backup', async t => {
  let primaryRequests = 0;
  let backupRequests = 0;
  const backup = http.createServer((_req, res) => { backupRequests += 1; replyFailoverResponse(res, 200, 'backup'); });
  const backupPort = await listen(backup);
  t.after(() => { backup.closeAllConnections(); backup.close(); });
  const primary = http.createServer(async (req, res) => {
    primaryRequests += 1;
    let text = ''; for await (const chunk of req) text += chunk;
    if (JSON.parse(text).stream) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'); }
    else replyFailoverResponse(res, 200, 'primary');
  });
  const app = await createTimeoutFixture(t, primary);
  await app.store.update(config => ({ ...config, upstreams: [...config.upstreams, { id: 'cancel-backup', enabled: true, baseUrl: `http://127.0.0.1:${backupPort}`, protocol: 'Chat', trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], routes: config.routes.map(route => ({ ...route, targets: [{ upstreamId: 'deadline-upstream', modelId: 'mock-chat' }, { upstreamId: 'cancel-backup', modelId: 'backup' }], failover: { failureThreshold: 1, statusClasses: [5], cooldownSeconds: 60 } })) }));
  const response = await app.request('Chat', true);
  const reader = response.body.getReader();
  await reader.read(); await reader.cancel();
  const failed = await waitForUsage(app.store);
  assert.equal(failed.streamFailurePhase, 'downstream_closed');
  assert.equal(failed.errorCode, 'request_aborted');
  const next = await app.request('Chat', false);
  assert.equal((await next.json()).choices[0].message.content, 'primary');
  assert.equal(primaryRequests, 2);
  assert.equal(backupRequests, 0);
});

test('credential usage bookkeeping failure cannot replace a valid response or create duplicate terminal logs', async t => {
  const upstream = http.createServer((_req, res) => replyFailoverResponse(res, 200, 'valid'));
  const app = await createTimeoutFixture(t, upstream);
  const update = app.store.update.bind(app.store);
  app.store.update = mutator => update(async current => {
    const next = await mutator(current);
    if (next.clientKeys.some(key => key.lastUsedAt)) throw new Error('private-bookkeeping-failure');
    return next;
  });
  const response = await app.request('Chat', false);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'valid');
  await waitForUsage(app.store);
  const logs = (await app.store.read()).usage;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'completed');
  assert.equal(logs[0].credentialUsageUpdateFailed, true);
  assert.doesNotMatch(JSON.stringify(logs), /private-bookkeeping-failure/);
});

test('gateway advances to a later validated address only when TCP fails before the model request is sent', async t => {
  let modelRequests = 0;
  const upstream = http.createServer(async (req, res) => {
    modelRequests += 1;
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).model, 'mock-chat');
    replyFailoverResponse(res, 200, 'connected-to-healthy-address');
  });
  const app = await createTimeoutFixture(t, upstream, {
    dnsLookup: async hostname => hostname === 'dual-address.test'
      ? [{ address: '127.0.0.1', family: 4 }, { address: '127.0.0.2', family: 4 }]
      : [],
  }, '127.0.0.2');
  const port = upstream.address().port;
  await app.store.update(config => ({
    ...config,
    upstreams: config.upstreams.map(item => ({ ...item, baseUrl: `http://dual-address.test:${port}`, approvedAddresses: ['127.0.0.1', '127.0.0.2'] })),
  }));

  const response = await app.request('Chat', false);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'connected-to-healthy-address');
  assert.equal(modelRequests, 1);
  assert.equal((await waitForUsage(app.store)).status, 'completed');
});

test('Responses passthrough clean EOF without a terminal marker emits one failed terminal event', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","sequence_number":40,"delta":"partial"}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => ({ ...route, outboundProtocol: 'Res' })) }));
  const response = await app.request('Res', true);
  const frames = responsesFrames(await response.text());
  assert.equal(frames.at(-1).type, 'error');
  assert.equal(frames.at(-1).sequence_number, 41);
  assert.equal(frames.filter(frame => frame.type === 'error').length, 1);
  assert.equal((await waitForUsage(app.store)).status, 'failed');
});

test('Responses passthrough successful terminal preserves original framing and UTF-8 after clean EOF', async t => {
  const wire = ': ping\r\n\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","sequence_number":40,"delta":"你好"}\r\n\r\nevent: response.completed\r\ndata: {"type":"response.completed","sequence_number":41,"response":{"status":"completed"}}\r\n\r\n';
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const bytes = Buffer.from(wire);
    const split = bytes.indexOf(Buffer.from('你好')) + 1;
    res.write(bytes.subarray(0, split));
    res.end(bytes.subarray(split));
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => ({ ...route, outboundProtocol: 'Res' })) }));
  const response = await app.request('Res', true);
  assert.equal(await response.text(), wire);
  assert.equal((await waitForUsage(app.store)).status, 'completed');
});

test('Responses passthrough semantic failure cannot be recorded as a completed request', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"response.output_text.delta","sequence_number":40,"delta":"partial"}\n\ndata: {"type":"response.failed","sequence_number":41,"response":{"error":{"message":"private-provider-error"}}}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => ({ ...route, outboundProtocol: 'Res' })) }));
  const response = await app.request('Res', true);
  const wire = await response.text();
  assert.equal(responsesFrames(wire).at(-1).type, 'error');
  assert.doesNotMatch(wire, /private-provider-error/);
  const log = await waitForUsage(app.store);
  assert.equal(log.status, 'failed');
  assert.doesNotMatch(JSON.stringify(log), /private-provider-error/);
});

test('Responses passthrough completion waits for clean EOF and never precedes reset error', async t => {
  let upstreamResponse;
  const upstream = http.createServer((_req, res) => {
    upstreamResponse = res;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"type":"response.output_text.delta","sequence_number":40,"delta":"partial"}\n\ndata: {"type":"response.completed","sequence_number":41,"response":{"status":"completed"}}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => ({ ...route, outboundProtocol: 'Res' })) }));
  const response = await app.request('Res', true);
  const reader = response.body.getReader();
  let wire = Buffer.from((await reader.read()).value).toString();
  upstreamResponse.destroy();
  while (true) { const chunk = await reader.read(); if (chunk.done) break; wire += Buffer.from(chunk.value).toString(); }
  const frames = responsesFrames(wire);
  assert.equal(frames.filter(frame => frame.type === 'response.completed').length, 0);
  assert.equal(frames.filter(frame => frame.type === 'error').length, 1);
  assert.ok(frames.at(-1).sequence_number > 40);
  assert.equal((await waitForUsage(app.store)).status, 'failed');
});

test('Responses passthrough rejects an exhausted sequence range before forwarding the unsafe event', async t => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {"type":"response.output_text.delta","sequence_number":40,"delta":"safe"}\n\n' + `data: ${JSON.stringify({ type: 'response.output_text.delta', sequence_number: Number.MAX_SAFE_INTEGER, delta: 'unsafe' })}\n\n` + 'data: {"type":"response.output_text.delta","sequence_number":42,"delta":"after-invalid"}\n\n');
  });
  const app = await createTimeoutFixture(t, upstream);
  await app.store.update(config => ({ ...config, routes: config.routes.map(route => ({ ...route, outboundProtocol: 'Res' })) }));
  const response = await app.request('Res', true);
  const frames = responsesFrames(await response.text());
  assert.equal(frames.some(frame => frame.delta === 'unsafe'), false);
  assert.equal(frames.some(frame => frame.delta === 'after-invalid'), false);
  assert.equal(frames.at(-1).type, 'error');
  assert.equal(frames.at(-1).sequence_number, 41);
});

test('gateway does not reuse a pooled connection outside the latest approved DNS set', async t => {
  let primaryRequests = 0;
  let alternateRequests = 0;
  let address = '127.0.0.1';
  const primary = http.createServer((_req, res) => { primaryRequests += 1; replyFailoverResponse(res, 200, 'first-address'); });
  const app = await createTimeoutFixture(t, primary, { dnsLookup: async () => [{ address, family: 4 }] });
  const alternate = http.createServer((_req, res) => { alternateRequests += 1; replyFailoverResponse(res, 200, 'new-address'); });
  await new Promise((resolve, reject) => alternate.listen(primary.address().port, '127.0.0.2', resolve).once('error', reject));
  t.after(() => { alternate.closeAllConnections(); alternate.close(); });
  await app.store.update(config => ({ ...config, upstreams: config.upstreams.map(item => ({ ...item, baseUrl: `http://pooled-address.test:${primary.address().port}` })) }));
  assert.equal((await (await app.request('Chat', false)).json()).choices[0].message.content, 'first-address');
  address = '127.0.0.2';
  await app.store.update(config => ({ ...config, upstreams: config.upstreams.map(item => ({ ...item, approvedAddresses: [address] })) }));
  assert.equal((await (await app.request('Chat', false)).json()).choices[0].message.content, 'new-address');
  assert.equal(primaryRequests, 1);
  assert.equal(alternateRequests, 1);
});

test('gateway sanitizes an invalid upstream HTTP status and remains available for the next request', async t => {
  let requests = 0;
  const upstream = net.createServer(socket => {
    socket.once('data', () => {
      requests += 1;
      if (requests === 1) socket.end('HTTP/1.1 600 Invalid\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      else { const body = JSON.stringify({ choices: [{ message: { content: 'healthy' } }] }); socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); }
    });
  });
  // Match the shared HTTP fixture cleanup surface for this raw TCP fixture.
  const sockets = new Set();
  upstream.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  upstream.closeAllConnections = () => { for (const socket of sockets) socket.destroy(); };
  const app = await createTimeoutFixture(t, upstream);
  const failed = await app.request('Chat', false);
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).error, 'upstream_error');
  assert.equal((await waitForUsage(app.store)).status, 'failed');
  const recovered = await app.request('Chat', false);
  assert.equal((await recovered.json()).choices[0].message.content, 'healthy');
  assert.equal(requests, 2);
});
