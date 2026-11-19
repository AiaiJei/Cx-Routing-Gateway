import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));

test('models saved together are independently callable through Gateway using their original names', async t => {
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const model = JSON.parse(body).model;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `reply:${model}` } }] }));
  });
  const upstreamUrl = await listen(upstream);
  t.after(() => upstream.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-batch-e2e-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'vault.json'), 'test-key');
  const key = 'test-client';
  await store.update(config => ({ ...config, upstreams: [{ id: 'up', baseUrl: upstreamUrl, enabled: true, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], clientKeys: [{ id: 'key', keyHash: crypto.createHash('sha256').update(key).digest('hex'), enabled: true }] }));
  const control = createControlServer({ store, vault, controlToken: 'control-test' });
  const controlUrl = await listen(control);
  t.after(() => control.close());
  const saved = await fetch(`${controlUrl}/v1/control/routes/batch`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer control-test' }, body: JSON.stringify({ inboundProtocol: 'Chat', outboundProtocol: 'Chat', targets: ['model-a', 'model-b'].map(modelId => ({ upstreamId: 'up', modelId })) }) });
  assert.equal(saved.status, 200);
  const gateway = createGatewayServer({ store, vault });
  const gatewayUrl = await listen(gateway);
  t.after(() => gateway.close());
  for (const model of ['model-a', 'model-b']) {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'test' }] }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, `reply:${model}`);
  }
});

test('same model selected from two upstreams saves once and prefers the first upstream', async t => {
  const urls = [];
  for (const label of ['A', 'B']) {
    const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: label } }] })); });
    urls.push(await listen(server)); t.after(() => server.close());
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-multi-upstream-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const vault = new SecretVault(path.join(dir, 'vault.json'), 'test-key');
  await store.update(config => ({ ...config, upstreams: urls.map((baseUrl, i) => ({ id: `up-${i}`, baseUrl, enabled: true, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] })), clientKeys: [{ id: 'key', keyHash: crypto.createHash('sha256').update('client').digest('hex'), enabled: true }] }));
  const control = createControlServer({ store, vault, controlToken: 'control-test' });
  const base = await listen(control); t.after(() => control.close());
  const payload = { inboundProtocol: 'Chat', outboundProtocol: 'Chat', targets: [{ upstreamId: 'up-0', modelId: 'same' }, { upstreamId: 'up-1', modelId: 'same' }] };
  const save = () => fetch(`${base}/v1/control/routes/batch`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer control-test' }, body: JSON.stringify(payload) });
  assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 200);
  const config = await store.read();
  assert.equal(config.routes.length, 1);
  assert.deepEqual(config.routes[0].targets, payload.targets);
  const blockedDelete = await fetch(`${base}/v1/control/upstreams/up-1`, { method: 'DELETE', headers: { authorization: 'Bearer control-test' } });
  assert.equal(blockedDelete.status, 409);
  const gateway = createGatewayServer({ store, vault }); const gatewayUrl = await listen(gateway); t.after(() => gateway.close());
  const replies = [];
  for (let i = 0; i < 4; i++) {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer client' }, body: JSON.stringify({ model: 'same', messages: [{ role: 'user', content: 'test' }] }) });
    assert.equal(response.status, 200); replies.push((await response.json()).choices[0].message.content);
  }
  assert.deepEqual(replies, ['A', 'A', 'A', 'A']);
});

test('priority failover counts only configured errors, resets on success, and restores primary after cooldown', async t => {
  let now = 1000; let primaryStatus = 503; const calls = [];
  const urls = [];
  for (const label of ['A', 'B']) {
    const server = http.createServer((_req, res) => {
      calls.push(label); const status = label === 'A' ? primaryStatus : 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: label } }] }));
    });
    urls.push(await listen(server)); t.after(() => server.close());
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-priority-'));
  const store = new ConfigStore(path.join(dir, 'config.json')); const vault = new SecretVault(path.join(dir, 'vault.json'), 'key');
  await store.update(config => ({ ...config, upstreams: urls.map((baseUrl, i) => ({ id: `up-${i}`, baseUrl, enabled: true, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] })), routes: [{ id: 'r', alias: 'm', inboundProtocol: 'Chat', outboundProtocol: 'Chat', enabled: true, upstreamId: 'up-0', modelId: 'm', targets: [{ upstreamId: 'up-0', modelId: 'm' }, { upstreamId: 'up-1', modelId: 'm' }], failover: { failureThreshold: 2, statusClasses: [5], cooldownSeconds: 60 } }], clientKeys: [{ id: 'k', keyHash: crypto.createHash('sha256').update('client').digest('hex'), enabled: true }] }));
  const gateway = createGatewayServer({ store, vault, now: () => now }); const base = await listen(gateway); t.after(() => gateway.close());
  const call = () => fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer client' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'test' }] }) });
  assert.equal((await call()).status, 502);
  primaryStatus = 200; assert.equal((await call()).status, 200);
  primaryStatus = 400; assert.equal((await call()).status, 502);
  primaryStatus = 503; assert.equal((await call()).status, 502); assert.equal((await call()).status, 502);
  assert.equal((await (await call()).json()).choices[0].message.content, 'B');
  assert.deepEqual(calls, ['A', 'A', 'A', 'A', 'A', 'B']);
  now += 60001; primaryStatus = 200;
  assert.equal((await (await call()).json()).choices[0].message.content, 'A');
});

test('configured 4xx failures and network errors switch priority without retrying the same request', async t => {
  let primaryCalls = 0; let fallbackCalls = 0;
  const primary = http.createServer((_req, res) => { primaryCalls++; res.writeHead(429); res.end(); });
  const fallback = http.createServer((_req, res) => { fallbackCalls++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'fallback' } }] })); });
  const urls = [await listen(primary), await listen(fallback)]; t.after(() => { primary.close(); fallback.close(); });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-status-priority-'));
  const store = new ConfigStore(path.join(dir, 'config.json')); const vault = new SecretVault(path.join(dir, 'vault.json'), 'key');
  const upstreams = urls.map((baseUrl, i) => ({ id: `u${i}`, baseUrl, enabled: true, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }));
  await store.update(config => ({ ...config, upstreams, routes: [{ id: 'r', alias: 'm', inboundProtocol: 'Chat', outboundProtocol: 'Chat', enabled: true, upstreamId: 'u0', modelId: 'm', targets: upstreams.map(up => ({ upstreamId: up.id, modelId: 'm' })), failover: { failureThreshold: 1, statusClasses: [4], cooldownSeconds: 60 } }], clientKeys: [{ id: 'k', keyHash: crypto.createHash('sha256').update('client').digest('hex'), enabled: true }] }));
  const gateway = createGatewayServer({ store, vault }); const base = await listen(gateway); t.after(() => gateway.close());
  const call = () => fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer client' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'test' }] }) });
  assert.equal((await call()).status, 502);
  assert.equal(primaryCalls, 1); assert.equal(fallbackCalls, 0);
  assert.equal((await call()).status, 200); assert.equal(fallbackCalls, 1);
  await store.update(config => ({ ...config, upstreams: config.upstreams.map(up => up.id === 'u0' ? { ...up, baseUrl: 'http://127.0.0.1:1' } : up), routes: config.routes.map(route => ({ ...route, failover: { failureThreshold: 1, statusClasses: [5], cooldownSeconds: 60 } })) }));
  assert.equal((await call()).status, 502);
  assert.equal((await call()).status, 200);
  assert.equal(fallbackCalls, 2);
});
