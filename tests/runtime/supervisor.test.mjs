import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { closeServer, startRuntime } from '../../apps/desktop/electron/runtime-supervisor.cjs';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  server.close();
  return port;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test('runtime supervisor starts both local services and stops them through liveness pipes', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-runtime-'));
  const controlPort = await freePort();
  const gatewayPort = await freePort();
  const runtime = await startRuntime({ dataDir: dir, masterKey: 'runtime-test-key', controlPort, gatewayPort });
  t.after(() => runtime.stop());
  await waitFor(`http://127.0.0.1:${controlPort}/health`);
  await waitFor(`http://127.0.0.1:${gatewayPort}/health`);
  assert.equal(runtime.children.length, 2);
  assert.equal(runtime.getStatus().state, 'running');
  const unauthorized = await fetch(`http://127.0.0.1:${controlPort}/v1/control/state`);
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`http://127.0.0.1:${controlPort}/v1/control/state`, { headers: { authorization: `Bearer ${runtime.controlToken}` } });
  assert.equal(authorized.status, 200);
  await runtime.stop();
  assert.equal(runtime.getStatus().state, 'stopped');
  await assert.rejects(fetch(`http://127.0.0.1:${gatewayPort}/health`));
});

test('runtime restart preserves the configured upstream credential and routes through it', async (t) => {
  let seenAuthorization;
  const upstream = http.createServer(async (req, res) => {
    seenAuthorization = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'persisted' } }] }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-runtime-restart-'));
  const controlPort = await freePort();
  const gatewayPort = await freePort();
  const masterKey = 'runtime-restart-master-key-1234567890';
  const first = await startRuntime({ dataDir: dir, masterKey, controlPort, gatewayPort });
  const auth = { authorization: 'Bearer ' + first.controlToken };
  const createdUpstream = await fetch('http://127.0.0.1:' + controlPort + '/v1/control/upstreams', {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Persisted', baseUrl: 'http://127.0.0.1:' + upstreamPort, protocol: 'Chat', apiKey: 'persisted-upstream-key', allowPrivateNetwork: true }),
  }).then((response) => response.json());
  await fetch('http://127.0.0.1:' + controlPort + '/v1/control/routes', {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ alias: 'persisted-route', inboundProtocol: 'Chat', outboundProtocol: 'Chat', upstreamId: createdUpstream.id, modelId: 'persisted-model' }),
  });
  const clientKey = await fetch('http://127.0.0.1:' + controlPort + '/v1/control/client-keys', {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'restart-client' }),
  }).then((response) => response.json());
  const configPath = path.join(dir, 'config.json');
  const configBefore = JSON.parse(await fs.readFile(configPath, 'utf8'));
  assert.equal(configBefore.upstreams[0].credentialRef.length > 0, true);
  assert.equal((await fs.readFile(path.join(dir, 'secrets.json'), 'utf8')).includes('persisted-upstream-key'), false);
  await first.stop();
  const second = await startRuntime({ dataDir: dir, masterKey, controlPort, gatewayPort });
  t.after(async () => { await second.stop(); upstream.close(); });
  const response = await fetch('http://127.0.0.1:' + gatewayPort + '/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + clientKey.key },
    body: JSON.stringify({ model: 'persisted-route', messages: [{ role: 'user', content: 'hello' }] }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'persisted');
  assert.equal(seenAuthorization, 'Bearer persisted-upstream-key');
});

test('in-process server shutdown force-closes a connection after the grace period', async (t) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.flushHeaders();
    res.write('waiting');
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${port}`);
  const pendingBody = response.text();
  const startedAt = Date.now();
  await closeServer(server, 50);
  assert.ok(Date.now() - startedAt < 1000, 'shutdown should finish shortly after the configured grace period');
  await assert.rejects(pendingBody);
});
