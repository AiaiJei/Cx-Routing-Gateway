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

async function setup(t, respond, outbound = 'Chat', gatewayOptions = {}) {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'request-logs-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const writeErrors = [];
  const update = store.update.bind(store);
  store.update = (...args) => update(...args).catch(error => { writeErrors.push({ code: error.code, message: error.message }); throw error; });
  const upstream = http.createServer(respond);
  const upPort = await listen(upstream);
  await store.update(config => ({ ...config, upstreams: [{ id: 'up', name: 'Primary upstream', enabled: true, baseUrl: `http://127.0.0.1:${upPort}`, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], routes: ['Chat', 'Res', 'Mes'].map(inbound => ({ id: inbound, alias: inbound, inboundProtocol: inbound, outboundProtocol: outbound, upstreamId: 'up', modelId: 'model', enabled: true })), clientKeys: [{ id: 'key', enabled: true, scope: [], keyHash: crypto.createHash('sha256').update('test-key').digest('hex') }] }));
  const gateway = createGatewayServer({ store, vault: {}, ...gatewayOptions });
  const port = await listen(gateway);
  const control = createControlServer({ store, vault: {}, allowUnauthenticated: true });
  const controlPort = await listen(control);
  t.after(async () => { await Promise.all([close(gateway), close(control), close(upstream)]); await store.writeQueue; });
  return {
    async persistedLogs() {
      await store.writeQueue;
      return (await new ConfigStore(store.filePath).read()).usage;
    },
    async request(protocol, stream, reasoning) {
      const endpoint = { Chat: 'chat/completions', Res: 'responses', Mes: 'messages' }[protocol];
      return fetch(`http://127.0.0.1:${port}/v1/${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' }, body: JSON.stringify({ model: protocol, stream, input: 'private-prompt', messages: [{ role: 'user', content: 'private-prompt' }], ...(reasoning === undefined ? {} : reasoning) }) });
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
  assert.equal(log.httpStatus, 200);
  assert.ok(Date.parse(log.createdAt) >= before);
  assert.ok(Date.parse(log.createdAt) <= Date.now() - log.durationMs + 5);
  assert.doesNotMatch(JSON.stringify(log), /private-|test-key/);
});

test('successful JSON request logs separate upstream 201 from downstream 200', async t => {
  const app = await setup(t, (_req, res) => {
    res.writeHead(201);
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  const response = await app.request('Chat', false);
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.httpStatus, 201);
  assert.equal(log.gatewayStatus, 200);
});

test('passthrough and converted streams preserve responses and persist first-generation timing and usage', async t => {
  let firstSent = 0;
  let monotonicTime = 100;
  let receivedPayload;
  const wire = event({ choices: [{ delta: { role: 'assistant', content: '' } }] }) + ': ping\n\n';
  const content = event({ choices: [{ delta: { content: 'OK' } }] });
  const end = event({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } }) + 'data: [DONE]\n\n';
  const app = await setup(t, async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk; receivedPayload = JSON.parse(data);
    if (!receivedPayload.stream) { res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(wire);
    setTimeout(() => { monotonicTime = 150; firstSent = monotonicTime; res.write(content); setTimeout(() => { monotonicTime = 180; res.end(end); }, 25); }, 35);
  }, 'Chat', { monotonicNow: () => monotonicTime });
  for (const [index, protocol] of ['Chat', 'Res', 'Mes'].entries()) {
    monotonicTime = 100;
    const response = await app.request(protocol, true);
    const body = await response.text();
    assert.equal(receivedPayload.stream, true);
    assert.equal(receivedPayload.stream_options.include_usage, true);
    if (protocol === 'Chat') assert.equal(body, wire + content + end);
    else assert.match(body, /OK/);
    const log = (await app.logs(index + 1)).at(-1);
    assert.equal(log.stream, true);
    assert.deepEqual(log.tokens, { input: 7, output: 2, total: 9 });
    assert.ok(log.firstTokenMs >= firstSent - 100);
    assert.ok(log.durationMs >= log.firstTokenMs + 15);
  }
});

test('Responses logs recover nested completion usage when an earlier usage source is empty', async t => {
  const app = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(event({ type: 'response.output_text.delta', delta: 'done' }) + event({ type: 'response.completed', usage: {}, response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 2, private: 'secret-provider-field' } } }));
  }, 'Res');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.status, 'completed');
  assert.deepEqual(log.tokens, { input: 3, output: 2, total: 5 });
  assert.deepEqual(log.usageDiagnostic, { status: 'reported', sources: ['usage', 'response.usage'], missingFields: [], invalidFields: [] });
  assert.doesNotMatch(JSON.stringify(log), /secret-provider-field/);
});

test('completed Responses without upstream usage stay successful and record missing usage', async t => {
  const app = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(event({ type: 'response.output_text.delta', delta: 'done' }) + event({ type: 'response.completed', response: { status: 'completed' } }));
  }, 'Res');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.status, 'completed');
  assert.deepEqual(log.usageDiagnostic, { status: 'missing', sources: [], missingFields: ['input_tokens', 'output_tokens'], invalidFields: [] });
});

test('paced Responses-to-Chat stream logs separate upstream stages without retaining payload data', async t => {
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const app = await setup(t, async (_req, res) => {
    await pause(60);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.flushHeaders();
    await pause(60);
    res.write(': first-upstream-byte\n\n');
    await pause(60);
    res.write(event({ choices: [{ delta: { content: 'private-response-marker' } }] }));
    await pause(60);
    res.end(event({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) + 'data: [DONE]\n\n');
  }, 'Chat');

  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  const responseBody = await response.text();
  assert.match(responseBody, /private-response-marker/);
  assert.ok(responseBody.indexOf('private-response-marker') < responseBody.indexOf('response.completed'));
  const [log] = await app.logs(1);

  assert.ok(log.upstreamHeadersMs >= 35);
  assert.ok(log.upstreamFirstByteMs - log.upstreamHeadersMs >= 35);
  assert.ok(log.upstreamBodyMs >= 90);
  assert.ok(log.upstreamChunkCount >= 3);
  assert.ok(log.gatewayProcessingMs > 0);
  assert.ok(log.firstTokenMs >= log.upstreamFirstByteMs);
  const [persisted] = await app.persistedLogs();
  assert.deepEqual(persisted, log);
  assert.doesNotMatch(JSON.stringify(persisted), /private-prompt|private-response-marker|data:|event:|test-key|authorization|responseBody|requestBody/);
});

test('request logs measure elapsed time monotonically across wall-clock changes', async t => {
  const startedWall = Date.parse('2026-11-21T08:00:00.000Z');
  let wallTime = startedWall;
  let monotonicTime = 100;
  const content = event({ choices: [{ delta: { content: 'OK' } }] });
  const end = event({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + 'data: [DONE]\n\n';
  const app = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(event({ choices: [{ delta: { role: 'assistant', content: '' } }] }));
    setTimeout(() => {
      wallTime -= 60_000;
      monotonicTime = 150;
      res.write(content);
      setTimeout(() => {
        wallTime += 120_000;
        monotonicTime = 200;
        res.end(end);
      }, 25);
    }, 25);
  }, 'Chat', { now: () => wallTime, monotonicNow: () => monotonicTime });
  const originalDateNow = Date.now;
  Date.now = () => wallTime;
  t.after(() => { Date.now = originalDateNow; });

  const response = await app.request('Chat', true);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(Date.parse(log.createdAt), startedWall);
  assert.equal(log.firstTokenMs, 50);
  assert.equal(log.durationMs, 100);
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
  assert.equal(log.upstreamStatus, 500);
  assert.doesNotMatch(JSON.stringify(log), /private-error/);
});

test('request logs retain only the transmitted reasoning level and prefer the primary field', async t => {
  const app = await setup(t, (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  const response = await app.request('Chat', false, { reasoning_effort: ' high ' });
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.reasoningEffort, 'high');

  const nested = await app.request('Chat', false, { reasoning: { effort: 'medium' } });
  assert.equal(nested.status, 200);
  await nested.text();
  const second = (await app.logs(2)).at(-1);
  assert.equal(second.reasoningEffort, 'medium');
});

test('Mes-to-Res requests forward and log the native Messages reasoning effort', async t => {
  let upstreamPayload;
  const app = await setup(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamPayload = JSON.parse(body);
    res.end(JSON.stringify({ id: 'response-1', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }));
  }, 'Res');

  const response = await app.request('Mes', false, { output_config: { effort: 'high' } });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(upstreamPayload.reasoning.effort, 'high');
  const [log] = await app.logs(1);
  assert.equal(log.reasoningEffort, 'high');
});

test('Res-to-Mes requests forward and log Responses reasoning effort', async t => {
  let upstreamPayload;
  const app = await setup(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamPayload = JSON.parse(body);
    res.end(JSON.stringify({ type: 'message', id: 'message-1', role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
  }, 'Mes');

  const response = await app.request('Res', false, { reasoning: { effort: 'xhigh' } });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(upstreamPayload.output_config.effort, 'xhigh');
  const [log] = await app.logs(1);
  assert.equal(log.reasoningEffort, 'xhigh');
});

test('request logs omit missing, oversized, and non-string reasoning levels', async t => {
  const app = await setup(t, (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  for (const value of [{ reasoning_effort: '' }, { reasoning_effort: 'x'.repeat(33) }, { thinking: { effort: 7 } }]) {
    const response = await app.request('Chat', false, value);
    assert.equal(response.status, 200);
    await response.text();
  }
  const logs = await app.logs(3);
  assert.equal('reasoningEffort' in logs[0], false);
  assert.equal('reasoningEffort' in logs[1], false);
  assert.equal('reasoningEffort' in logs[2], false);
});

test('request logs capture gateway status for sanitized gateway failures', async t => {
  const app = await setup(t, (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  const response = await app.request('Chat', false, { reasoning_effort: 'high', unsupported: true });
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.httpStatus, 200);
});

test('interrupted Responses stream persists actual statuses and bounded failure phase without payloads', async t => {
  let requests = 0;
  const app = await setup(t, async (req, res) => {
    requests++;
    for await (const _chunk of req) { /* Drain the local fixture request. */ }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(event({ type: 'response.output_text.delta', sequence_number: 4, delta: 'private-response' }));
    const timer = setTimeout(() => res.destroy(), 50);
    res.on('close', () => clearTimeout(timer));
  }, 'Res');
  const response = await app.request('Res', true);
  assert.equal(response.status, 200);
  // Consume both the legacy abrupt-close path and Task 3's terminal error path.
  try { await response.text(); } catch (error) { assert.equal(error.message, 'terminated'); }
  const [log] = await app.logs(1);
  assert.equal(log.status, 'failed');
  assert.equal(log.errorCode, 'upstream_connection_reset');
  assert.equal(log.upstreamStatus, 200);
  assert.equal(log.gatewayStatus, 200);
  assert.equal(log.streamFailurePhase, 'upstream_body');
  assert.equal(log.stream, true);
  assert.ok(Number.isFinite(log.firstTokenMs));
  assert.ok(Number.isFinite(log.upstreamHeadersMs));
  assert.ok(Number.isFinite(log.upstreamFirstByteMs));
  assert.ok(Number.isFinite(log.upstreamBodyMs));
  assert.ok(log.upstreamChunkCount >= 1);
  assert.ok(Number.isFinite(log.gatewayProcessingMs));
  assert.equal(requests, 1);
  const [persisted] = await app.persistedLogs();
  assert.deepEqual(persisted, log);
  assert.doesNotMatch(JSON.stringify(persisted), /private-prompt|private-response|test-key|authorization|responseBody|requestBody/);
});
