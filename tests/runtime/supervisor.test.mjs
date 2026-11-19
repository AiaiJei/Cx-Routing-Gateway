import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
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
