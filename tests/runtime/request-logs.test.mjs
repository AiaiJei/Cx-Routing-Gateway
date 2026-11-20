import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';

const listen = (server) => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

async function setup(t, respond, outbound = 'Chat') {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'request-logs-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const writeErrors = [];
  const update = store.update.bind(store);
  store.update = (...args) => update(...args).catch(error => { writeErrors.push({ code: error.code, message: error.message }); throw error; });
  const upstream = http.createServer(respond);
  const upPort = await listen(upstream);
  await store.update(config => ({ ...config, upstreams: [{ id: 'up', name: 'Primary upstream', enabled: true, baseUrl: `http://127.0.0.1:${upPort}`, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], routes: ['Chat', 'Res', 'Mes'].map(inbound => ({ id: inbound, alias: inbound, inboundProtocol: inbound, outboundProtocol: outbound, upstreamId: 'up', modelId: 'model', enabled: true })), clientKeys: [{ id: 'key', enabled: true, scope: [], keyHash: crypto.createHash('sha256').update('test-key').digest('hex') }] }));
  const gateway = createGatewayServer({ store, vault: {} });
  const port = await listen(gateway);
  const control = createControlServer({ store, vault: {}, allowUnauthenticated: true });
  const controlPort = await listen(control);
  t.after(async () => { await Promise.all([close(gateway), close(control), close(upstream)]); await store.writeQueue; });
  return {
    async request(protocol, stream) {
      const endpoint = { Chat: 'chat/completions', Res: 'responses', Mes: 'messages' }[protocol];
      return fetch(`http://127.0.0.1:${port}/v1/${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' }, body: JSON.stringify({ model: protocol, stream, input: 'private-prompt', messages: [{ role: 'user', content: 'private-prompt' }] }) });
    },
    async logs(count) {
      for (let n = 0; n < 100; n++) {
        const state = await fetch(`http://127.0.0.1:${controlPort}/v1/control/state`).then(r => r.json());
        if (state.usage.length >= count) return state.usage;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error('Usage not persisted: ' + JSON.stringify({ count, writeErrors }));
    },
  };
}

test('JSON request logs carry real usage, request start and type through control API', async t => {
  const app = await setup(t, (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: 'private-response' } }], usage: { prompt_tokens: 10, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 0 }, private_field: 'private-usage' } })));
  const before = Date.now();
  const response = await app.request('Chat', false);
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.stream, false);
  assert.deepEqual(log.tokens, { input: 10, output: 3, total: 13, cacheRead: 0 });
  assert.equal(log.firstTokenMs, undefined);
  assert.equal(log.upstreamId, 'up');
  assert.equal(log.upstreamName, 'Primary upstream');
  assert.ok(Date.parse(log.createdAt) >= before);
  assert.ok(Date.parse(log.createdAt) <= Date.now() - log.durationMs + 5);
  assert.doesNotMatch(JSON.stringify(log), /private-|test-key/);
});

test('passthrough and converted streams preserve responses and persist first-generation timing and usage', async t => {
  let firstSent = 0;
  let receivedPayload;
  const wire = event({ choices: [{ delta: { role: 'assistant', content: '' } }] }) + ': ping\n\n';
  const content = event({ choices: [{ delta: { content: 'OK' } }] });
  const end = event({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } }) + 'data: [DONE]\n\n';
  const app = await setup(t, async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk; receivedPayload = JSON.parse(data);
    if (!receivedPayload.stream) { res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(wire);
    setTimeout(() => { firstSent = Date.now(); res.write(content); setTimeout(() => res.end(end), 25); }, 35);
  });
  for (const [index, protocol] of ['Chat', 'Res', 'Mes'].entries()) {
    const response = await app.request(protocol, true);
    const body = await response.text();
    assert.equal(receivedPayload.stream, true);
    assert.equal(receivedPayload.stream_options.include_usage, true);
    if (protocol === 'Chat') assert.equal(body, wire + content + end);
    else assert.match(body, /OK/);
    const log = (await app.logs(index + 1)).at(-1);
    assert.equal(log.stream, true);
    assert.deepEqual(log.tokens, { input: 7, output: 2, total: 9 });
    assert.ok(log.firstTokenMs >= firstSent - Date.parse(log.createdAt));
    assert.ok(log.durationMs >= log.firstTokenMs + 15);
  }
});

test('failed upstream records known request type without inventing usage or first token', async t => {
  const app = await setup(t, (_req, res) => { res.writeHead(500); res.end('private-error'); });
  const response = await app.request('Chat', true);
  assert.equal(response.status, 502);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.stream, true);
  assert.equal(log.tokens, undefined);
  assert.equal(log.firstTokenMs, undefined);
  assert.equal(log.errorCode, 'upstream_error');
  assert.equal(log.upstreamName, 'Primary upstream');
  assert.doesNotMatch(JSON.stringify(log), /private-error/);
});
