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

async function setup(t, respond, outbound = 'Chat', gatewayOptions = {}, fallbackRespond) {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'request-logs-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  const writeErrors = [];
  const update = store.update.bind(store);
  store.update = (...args) => update(...args).catch(error => { writeErrors.push({ code: error.code, message: error.message }); throw error; });
  const upstream = http.createServer(respond);
  const upPort = await listen(upstream);
  const fallback = fallbackRespond ? http.createServer(fallbackRespond) : undefined;
  const fallbackPort = fallback ? await listen(fallback) : undefined;
  await store.update(config => ({ ...config, upstreams: [{ id: 'up', name: 'Primary upstream', enabled: true, baseUrl: `http://127.0.0.1:${upPort}`, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], routes: ['Chat', 'Res', 'Mes'].map(inbound => ({ id: inbound, alias: inbound, inboundProtocol: inbound, outboundProtocol: outbound, upstreamId: 'up', modelId: 'model', enabled: true })), clientKeys: [{ id: 'key', enabled: true, scope: [], keyHash: crypto.createHash('sha256').update('test-key').digest('hex') }] }));
  if (fallbackPort) await store.update(config => ({ ...config,
    upstreams: [...config.upstreams, { id: 'fallback', name: 'Fallback upstream', enabled: true, baseUrl: `http://127.0.0.1:${fallbackPort}`, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }],
    routes: config.routes.map(route => ({ ...route, targets: [{ upstreamId: 'up', modelId: 'model' }, { upstreamId: 'fallback', modelId: 'model' }], failover: { failureThreshold: 1, statusClasses: [4, 5], cooldownSeconds: 60 } })),
  }));
  const gateway = createGatewayServer({ store, vault: {}, ...gatewayOptions });
  const port = await listen(gateway);
  const control = createControlServer({ store, vault: {}, allowUnauthenticated: true });
  const controlPort = await listen(control);
  t.after(async () => { await Promise.all([close(gateway), close(control), close(upstream), ...(fallback ? [close(fallback)] : [])]); await store.writeQueue; });
  return {
    async request(protocol, stream, reasoning, signal) {
      const endpoint = { Chat: 'chat/completions', Res: 'responses', Mes: 'messages' }[protocol];
      return fetch(`http://127.0.0.1:${port}/v1/${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' }, body: JSON.stringify({ model: protocol, stream, input: 'private-prompt', messages: [{ role: 'user', content: 'private-prompt' }], ...(reasoning === undefined ? {} : reasoning) }), signal });
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

test('passthrough and converted streams preserve responses and persist first-generation timing and usage', async t => {
  let firstSent = 0;
  let monotonicTime = 100;
  let receivedPayload;
  const wire = event({ choices: [{ delta: { role: 'assistant', content: '' } }] }) + ': ping\n\n';
  const content = event({ choices: [{ delta: { content: 'OK' } }] });
  const end = event({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } }) + event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
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
    const [log] = await app.logs(1);
    assert.equal(log.stream, true);
    assert.deepEqual(log.tokens, { input: 7, output: 2, total: 9 });
    assert.ok(log.firstTokenMs >= firstSent - 100);
    assert.ok(log.durationMs >= log.firstTokenMs + 15);
  }
});

test('request logs measure elapsed time monotonically across wall-clock changes', async t => {
  const startedWall = Date.parse('2026-11-21T08:00:00.000Z');
  let wallTime = startedWall;
  let monotonicTime = 100;
  const content = event({ choices: [{ delta: { content: 'OK' } }] });
  const end = event({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
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

test('a valid empty terminal stream is recorded as an empty response, not a useful success', async t => {
  const fixtures = {
    Chat: { body: 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', usageObserved: false },
    Res: { body: 'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":0}}}\n\n', usageObserved: true },
    Mes: { body: 'event: message_stop\ndata: {"type":"message_stop"}\n\n', usageObserved: false },
  };
  for (const [index, protocol] of ['Chat', 'Res', 'Mes'].entries()) {
    let receivedPrompt;
    const app = await setup(t, async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      receivedPrompt = JSON.parse(Buffer.concat(chunks).toString()).messages[0].content;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(fixtures[protocol].body);
    }, protocol);
    const response = await app.request(protocol, true);
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(receivedPrompt, 'private-prompt');
    const [log] = await app.logs(1);
    assert.equal(log.status, 'failed');
    assert.equal(log.errorCode, 'upstream_empty_response');
    assert.equal(log.streamCompletion, 'completed');
    assert.equal(log.outputObserved, false);
    assert.equal(log.usageObserved, fixtures[protocol].usageObserved);
    if (protocol === 'Res') assert.equal(log.tokens.output, 0);
  }
});

test('a missing terminal event fails the log and preserves observed TTFT', async t => {
  const fixtures = {
    Chat: 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\nevent: completion\ndata: [DONE]\n\n',
    Res: 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n',
    Mes: ': ping\n\n',
  };
  for (const [index, protocol] of ['Chat', 'Res', 'Mes'].entries()) {
    const app = await setup(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(fixtures[protocol]);
    }, protocol);
    const response = await app.request(protocol, true);
    assert.equal(response.status, 200);
    let body = '';
    const reader = response.body.getReader();
    await assert.rejects(async () => {
      const decoder = new TextDecoder();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        body += decoder.decode(result.value, { stream: true });
      }
    });
    if (protocol === 'Chat') assert.doesNotMatch(body, /\[DONE\]/);
    const [log] = await app.logs(1);
    assert.equal(log.status, 'failed');
    assert.equal(log.errorCode, 'upstream_stream_incomplete');
    assert.equal(log.streamCompletion, 'incomplete');
    assert.equal(log.outputObserved, protocol !== 'Mes');
    if (protocol !== 'Mes') assert.equal(typeof log.firstTokenMs, 'number');
  }
});

test('Responses failure events remain failures and raw provider details stay out of logs', async t => {
  const fixtures = [
    'event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","error":{"message":"private provider detail"}}}\n\n',
    'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"status":"incomplete","error":{"message":"private provider detail"}}}\n\n',
  ];
  for (const fixture of fixtures) {
    const app = await setup(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(fixture);
    }, 'Res');
    const response = await app.request('Res', true);
    assert.equal(response.status, 200);
    await assert.rejects(response.text());
    const [log] = await app.logs(1);
    assert.equal(log.status, 'failed');
    assert.equal(log.errorCode, 'upstream_stream_failed');
    assert.equal(log.streamCompletion, 'failed');
    assert.doesNotMatch(JSON.stringify(log), /private provider detail/);
  }
});

test('converted Responses terminal events require an explicit completed status before sending downstream completion', async t => {
  const fixtures = [
    { body: 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\nevent: response.done\ndata: {"type":"response.done","response":{"status":"incomplete","output":[]}}\n\n', status: 200 },
    { body: 'event: response.completed\ndata: {"type":"response.completed","response":{"output":[]}}\n\n', status: 502 },
  ];
  for (const fixture of fixtures) {
    const app = await setup(t, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(fixture.body);
    }, 'Res');
    const response = await app.request('Chat', true);
    let body = '';
    assert.equal(response.status, fixture.status);
    if (response.status === 200) {
      const reader = response.body.getReader();
      await assert.rejects(async () => {
        const decoder = new TextDecoder();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          body += decoder.decode(result.value, { stream: true });
        }
      });
      assert.match(body, /partial/);
    } else body = await response.text();
    assert.doesNotMatch(body, /"finish_reason"\s*:\s*"(?!null")[^"]+"|data:\s*\[DONE\]/);
    if (response.status === 502) assert.match(body, /upstream_stream_incomplete/);
    const [log] = await app.logs(1);
    assert.equal(log.status, 'failed');
    assert.equal(log.errorCode, 'upstream_stream_incomplete');
    assert.equal(log.streamCompletion, 'incomplete');
  }
});

test('upstream reset after content is distinct, preserves TTFT, and is not retried', async t => {
  let upstreamCalls = 0;
  const app = await setup(t, (_req, res) => {
    upstreamCalls += 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (upstreamCalls === 1) {
      res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      setTimeout(() => res.destroy(), 120);
      return;
    }
    res.end('data: {"choices":[{"delta":{"content":"recovered"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }, 'Chat', { maxConcurrentRequests: 1 });
  const first = await app.request('Chat', true);
  assert.equal(first.status, 200);
  await assert.rejects(first.text());
  const [failed] = await app.logs(1);
  assert.equal(failed.errorCode, 'upstream_connection_reset');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.streamCompletion, 'incomplete');
  assert.equal(typeof failed.firstTokenMs, 'number');
  assert.equal(upstreamCalls, 1);

  const second = await app.request('Chat', true);
  assert.equal(second.status, 200);
  await second.text();
  assert.deepEqual((await app.logs(2)).map(log => log.status), ['failed', 'completed']);
  assert.equal(upstreamCalls, 2);
});

test('streaming client cancellation preserves upstream health and releases the concurrency slot', async t => {
  let upstreamCalls = 0;
  let fallbackCalls = 0;
  let markUpstreamClosed;
  const upstreamClosed = new Promise(resolve => { markUpstreamClosed = resolve; });
  const app = await setup(t, (_req, res) => {
    upstreamCalls += 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (upstreamCalls === 1) {
      res.flushHeaders();
      res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      res.once('close', markUpstreamClosed);
      return;
    }
    res.end('data: {"choices":[{"delta":{"content":"recovered"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }, 'Chat', { maxConcurrentRequests: 1 }, (_req, res) => {
    fallbackCalls += 1;
    res.end('data: {"choices":[{"delta":{"content":"fallback"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const controller = new AbortController();
  const first = await app.request('Chat', true, undefined, controller.signal);
  const reader = first.body.getReader();
  const decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /partial/);
  controller.abort();
  await assert.rejects(reader.read());
  await Promise.race([upstreamClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('cancelled stream remained open upstream')), 1000))]);
  const [cancelled] = await app.logs(1);
  assert.equal(cancelled.errorCode, 'client_disconnected');
  assert.equal(typeof cancelled.firstTokenMs, 'number');
  assert.equal(upstreamCalls, 1);
  assert.equal(fallbackCalls, 0);

  const second = await app.request('Chat', true);
  assert.equal(second.status, 200);
  assert.match(await second.text(), /recovered/);
  assert.equal(upstreamCalls, 2);
  assert.equal(fallbackCalls, 0);
  const logs = await app.logs(2);
  assert.deepEqual(logs.map(log => log.status), ['failed', 'completed']);
});

test('request logs capture gateway status for sanitized gateway failures', async t => {
  const app = await setup(t, (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  const response = await app.request('Chat', false, { reasoning_effort: 'high', unsupported: true });
  assert.equal(response.status, 200);
  await response.text();
  const [log] = await app.logs(1);
  assert.equal(log.httpStatus, 200);
});
