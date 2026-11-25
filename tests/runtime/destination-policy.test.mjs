import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
import { validateDestination } from '../../services/gateway/src/server.mjs';

const lookup = addresses => async () => addresses.map(address => ({ address }));

test('gateway accepts rotating public DNS and returns only the current validated addresses', async () => {
  assert.deepEqual(await validateDestination('https://api.example/v1', false, ['8.8.8.8'], lookup(['1.1.1.1'])), ['1.1.1.1']);
  assert.deepEqual(await validateDestination('https://api.example/v1', false, ['8.8.8.8'], lookup(['2606:4700:4700::1111', '1.1.1.1', '1.1.1.1'])), ['1.1.1.1', '2606:4700:4700::1111']);
});

test('DNS rotation never permits private drift, mixed answers or sensitive destinations', async () => {
  for (const addresses of [['127.0.0.1'], ['10.0.0.1'], ['169.254.169.254'], ['::1'], ['fd00:ec2::254'], ['fe90::1'], ['0.0.0.0'], ['not-an-ip'], ['1.1.1.1', '127.0.0.1']]) {
    await assert.rejects(validateDestination('https://api.example', true, ['8.8.8.8'], lookup(addresses)), undefined, addresses.join(','));
  }
  await assert.rejects(validateDestination('http://private.example', true, ['127.0.0.1'], lookup(['127.0.0.2'])));
  await assert.rejects(validateDestination('http://private.example', true, ['127.0.0.1'], lookup(['1.1.1.1'])));
  assert.deepEqual(await validateDestination('http://private.example', true, ['127.0.0.1'], lookup(['127.0.0.1'])), ['127.0.0.1']);
});

test('control upstream test survives restart with stale public DNS and pins each connection', async t => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'dns-restart-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  await store.update(config => ({ ...config, upstreams: [{ id: 'rotating', baseUrl: 'http://api.example/v1', protocol: 'Chat', approvedAddresses: ['8.8.8.8'], enabled: true, credentialRef: 'fixture' }] }));
  let requests = 0;
  const upstream = http.createServer((req, res) => {
    requests++;
    assert.equal(req.headers.host, 'api.example');
    assert.equal(req.headers.authorization, 'Bearer fixture-only');
    res.end(JSON.stringify({ data: [{ id: 'local-model' }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const request = http.request;
  let currentAddress;
  t.mock.method(http, 'request', (options, callback) => {
    // Route the validated public destination to a local fixture. No external network.
    assert.equal(options.hostname, currentAddress);
    return request({ ...options, hostname: '127.0.0.1', port: upstream.address().port }, callback);
  });
  for (currentAddress of ['1.1.1.1', '9.9.9.9']) {
    const control = createControlServer({ store: new ConfigStore(file), vault: { get: async () => 'fixture-only' }, allowUnauthenticated: true, dnsLookup: lookup([currentAddress]) });
    await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/upstreams/rotating/test`, { method: 'POST' });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.deepEqual((await response.json()).models, ['local-model']);
    } finally { await new Promise(resolve => control.close(resolve)); }
  }
  assert.equal(requests, 2);
  assert.deepEqual((await store.read()).upstreams[0].approvedAddresses, ['8.8.8.8']);
});

test('control rejects public-to-private changes before reading credentials or making requests', async t => {
  const control = createControlServer({
    store: { read: async () => ({ upstreams: [{ id: 'unsafe', baseUrl: 'https://api.example', approvedAddresses: ['8.8.8.8'], trustedPrivateNetwork: true, credentialRef: 'must-not-read' }] }) },
    vault: { get: async () => { assert.fail('unsafe destination accessed credentials'); } },
    allowUnauthenticated: true, dnsLookup: lookup(['127.0.0.1']),
  });
  await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
  t.after(() => control.close());
  const response = await fetch(`http://127.0.0.1:${control.address().port}/v1/control/upstreams/unsafe/test`, { method: 'POST' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'destination_changed');
});
