import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';
import { applyRouteReasoningPolicy } from '../../packages/shared/src/reasoning-policy.mjs';

const protocols = ['Res', 'Mes', 'Chat'];
const endpoints = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' };
const effortOf = (protocol, body) => protocol === 'Res' ? body.reasoning?.effort : protocol === 'Mes' ? body.output_config?.effort : body.reasoning_effort;
const requestBody = (protocol, effort) => ({ model: protocol, ...(protocol === 'Res' ? { input: 'hello' } : { messages: [{ role: 'user', content: 'hello' }], max_tokens: 32 }), ...(effort === undefined ? {} : protocol === 'Res' ? { reasoning: { effort } } : protocol === 'Mes' ? { output_config: { effort } } : { reasoning_effort: effort }) });
function reply(protocol, res) {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(protocol === 'Res' ? { id: 'fixture', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }], usage: { input_tokens: 1, output_tokens: 1 } } : protocol === 'Mes' ? { id: 'fixture', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } : { id: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
}
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));

async function fixture(t, outbound, { reasoning = { min: 'low', max: 'high' }, handler } = {}) {
  const captured = [];
  const upstream = http.createServer(async (req, res) => {
    let source = ''; for await (const part of req) source += part;
    captured.push({ path: req.url, body: JSON.parse(source) });
    if (handler) handler(req, res, captured.length); else reply(outbound, res);
  });
  const upstreamUrl = await listen(upstream);
  const root = path.resolve('.tmp/codex-routing-range-20261126');
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'gateway-'));
  const store = new ConfigStore(path.join(dir, 'config.json'));
  await store.update(config => ({ ...config, upstreams: [{ id: 'up', baseUrl: upstreamUrl, enabled: true, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }], routes: protocols.map(inbound => ({ id: inbound, alias: inbound, inboundProtocol: inbound, outboundProtocol: outbound, upstreamId: 'up', modelId: 'unified-model', enabled: true, ...(reasoning === null ? {} : { reasoning }) })), clientKeys: [{ id: 'key', enabled: true, scope: [], keyHash: crypto.createHash('sha256').update('fixture-key').digest('hex') }] }));
  const gateway = createGatewayServer({ store, vault: {}, rateLimitPerMinute: 1000 });
  const base = await listen(gateway);
  t.after(async () => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); await store.writeQueue; });
  return { store, captured, async call(inbound, body = requestBody(inbound), key = 'fixture-key') {
    const response = await fetch(base + endpoints[inbound], { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await (response.headers.get('content-type')?.includes('text/event-stream') ? response.text() : response.json()) };
  } };
}

for (const outbound of protocols) {
  test(`route range reaches ${outbound} upstream and logs actual values from all three inbound protocols`, async t => {
    const app = await fixture(t, outbound);
    let count = 0;
    for (const inbound of protocols) {
      for (const [requested, expected] of [['none', 'low'], ['medium', 'medium'], ['max', 'high'], [undefined, 'medium'], ['', 'medium'], ['  high  ', 'high']]) {
        const result = await app.call(inbound, requestBody(inbound, requested));
        assert.equal(result.status, 200, `${inbound}->${outbound}: ${requested}`);
        assert.equal(app.captured.at(-1).path, endpoints[outbound]);
        assert.equal(app.captured.at(-1).body.model, 'unified-model');
        assert.equal(effortOf(outbound, app.captured.at(-1).body), expected, `${inbound}->${outbound}: ${requested}`);
        await app.store.writeQueue;
        const logs = (await app.store.read()).usage;
        assert.equal(logs.length, ++count);
        assert.equal(logs.at(-1).reasoningEffort, expected);
      }
    }
  });
}

test('missing effort clamps the medium default into the range at either boundary', async t => {
  const low = await fixture(t, 'Res', { reasoning: { min: 'none', max: 'minimal' } });
  const high = await fixture(t, 'Chat', { reasoning: { min: 'max', max: 'max' } });
  assert.equal((await low.call('Res')).status, 200);
  assert.equal(low.captured[0].body.reasoning.effort, 'minimal');
  assert.equal((await high.call('Res')).status, 200);
  assert.equal(high.captured[0].body.reasoning_effort, 'max');
});

test('range enforcement preserves sibling reasoning and format settings and synchronizes existing alternative effort fields', async t => {
  const resApp = await fixture(t, 'Res');
  const resBody = { ...requestBody('Res', 'max'), reasoning: { effort: 'max', summary: 'auto', generate_summary: 'concise' }, text: { verbosity: 'low', format: { type: 'json_object' } }, reasoning_effort: 'none', output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } }, thinking: { effort: 'medium', type: 'enabled', budget_tokens: 1024 } };
  assert.equal((await resApp.call('Res', resBody)).status, 200);
  const sent = resApp.captured[0].body;
  assert.deepEqual(sent.reasoning, { effort: 'high', summary: 'auto', generate_summary: 'concise' });
  assert.deepEqual(sent.text, resBody.text);
  assert.equal(sent.reasoning_effort, 'high');
  assert.deepEqual(sent.output_config, { ...resBody.output_config, effort: 'high' });
  assert.deepEqual(sent.thinking, { ...resBody.thinking, effort: 'high' });
  const mesApp = await fixture(t, 'Mes');
  const mesBody = { ...requestBody('Mes', 'none'), output_config: { effort: 'none', format: { type: 'json_schema', schema: { type: 'object' } }, extra: true } };
  assert.equal((await mesApp.call('Mes', mesBody)).status, 200);
  assert.deepEqual(mesApp.captured[0].body.output_config, { ...mesBody.output_config, effort: 'low' });
  const cross = await fixture(t, 'Mes');
  assert.equal((await cross.call('Res', { ...requestBody('Res', 'max'), text: { format: { type: 'json_schema', name: 'result', schema: { type: 'object' } } } })).status, 200);
  assert.deepEqual(cross.captured[0].body.output_config, { effort: 'high', format: { type: 'json_schema', schema: { type: 'object' } } });
});

test('active policy rejects unknown levels and malformed fields before forwarding, including alternative-field bypasses', async t => {
  const app = await fixture(t, 'Chat');
  for (const inbound of protocols) {
    for (const effort of ['ultra', 'persistent', 'made-up', null, 0, false, {}, []]) {
      const result = await app.call(inbound, requestBody(inbound, effort));
      assert.equal(result.status, 400, `${inbound}: ${JSON.stringify(effort)}`);
      assert.equal(result.body.error, 'invalid_reasoning_effort');
    }
  }
  for (const extras of [{ reasoning: [] }, { reasoning: 'high' }, { output_config: null }, { thinking: false }, { reasoning_effort: 'persistent' }, { thinking: { effort: 'made-up' } }]) {
    assert.equal((await app.call('Res', { ...requestBody('Res', 'medium'), ...extras })).status, 400, JSON.stringify(extras));
  }
  assert.equal(app.captured.length, 0);
  await app.store.writeQueue;
  const rejected = (await app.store.read()).usage;
  assert.equal(rejected.length, 30);
  assert.equal(rejected.every(log => log.status === 'rejected' && log.errorCode === 'invalid_reasoning_effort' && !Object.hasOwn(log, 'reasoningEffort')), true);
  assert.equal((await app.call('Res', requestBody('Res', 'persistent'), 'wrong-key')).status, 401);
});

test('legacy routes without a range retain same-protocol payloads and do not invent missing effort', async t => {
  for (const protocol of protocols) {
    const app = await fixture(t, protocol, { reasoning: null });
    for (const effort of [undefined, 'ultra', 'persistent', null]) {
      const source = requestBody(protocol, effort);
      assert.equal((await app.call(protocol, source)).status, 200);
      assert.deepEqual(app.captured.at(-1).body, { ...source, model: 'unified-model' });
    }
  }
});

test('the same route range stays effective when priority failover selects a different upstream', async t => {
  const app = await fixture(t, 'Chat', { handler: (_req, res) => { res.writeHead(503); res.end('{}'); } });
  const fallbackBodies = [];
  const fallback = http.createServer(async (req, res) => { let body = ''; for await (const part of req) body += part; fallbackBodies.push(JSON.parse(body)); reply('Chat', res); });
  const fallbackUrl = await listen(fallback);
  t.after(() => { fallback.closeAllConnections(); fallback.close(); });
  await app.store.update(config => ({ ...config, upstreams: [...config.upstreams, { ...config.upstreams[0], id: 'fallback', baseUrl: fallbackUrl }], routes: config.routes.map(route => ({ ...route, targets: [{ upstreamId: 'up', modelId: 'unified-model' }, { upstreamId: 'fallback', modelId: 'unified-model' }], failover: { failureThreshold: 1, statusClasses: [5], cooldownSeconds: 60 } })) }));
  assert.equal((await app.call('Res', requestBody('Res', 'max'))).status, 502);
  assert.equal((await app.call('Res', requestBody('Res', 'max'))).status, 200);
  assert.equal(app.captured[0].body.reasoning_effort, 'high');
  assert.equal(fallbackBodies[0].reasoning_effort, 'high');
  await app.store.writeQueue;
  const logs = (await app.store.read()).usage;
  assert.deepEqual(logs.map(log => [log.reasoningEffort, log.upstreamId, log.status]), [['high', 'up', 'failed'], ['high', 'fallback', 'completed']]);
});

test('hosted-tool rejection exposes only safe type and fixed guidance, without private tool content', async t => {
  const app = await fixture(t, 'Chat');
  const privateText = 'private-name-parameter-secret';
  const result = await app.call('Res', { ...requestBody('Res', 'medium'), tools: [{ type: 'web_search', name: privateText, parameters: { privateText }, arguments: privateText }] });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'unsupported_feature');
  assert.equal(result.body.toolType, 'web_search');
  assert.equal(result.body.field, 'tools.type');
  assert.equal(result.body.direction, 'Res->Chat');
  assert.match(result.body.message, /Reapply Gateway setup/);
  assert.doesNotMatch(JSON.stringify(result.body), /private-name-parameter-secret/);
  const unsafe = await app.call('Res', { ...requestBody('Res', 'medium'), tools: [{ type: 'private-tool-secret\nunsafe' }] });
  assert.equal(unsafe.status, 400);
  assert.equal(Object.hasOwn(unsafe.body, 'toolType'), false);
  assert.doesNotMatch(JSON.stringify(unsafe.body), /private-tool-secret/);
  assert.equal(app.captured.length, 0);
});

test('policy projection leaves the source body untouched and respects every ordered level', () => {
  const source = Object.freeze({ reasoning: Object.freeze({ effort: 'max', summary: 'auto' }), thinking: Object.freeze({ effort: 'minimal', budget_tokens: 1024 }), text: Object.freeze({ format: Object.freeze({ type: 'json_object' }) }) });
  const result = applyRouteReasoningPolicy(source, 'Res', { min: 'low', max: 'high' });
  assert.equal(result.effort, 'high');
  assert.equal(result.input.reasoning.effort, 'high');
  assert.equal(result.input.thinking.effort, 'high');
  assert.equal(source.reasoning.effort, 'max');
  assert.equal(source.thinking.effort, 'minimal');
  assert.equal(result.input.text, source.text);
  assert.equal(applyRouteReasoningPolicy(source, 'Res', undefined).input, source);
  for (const level of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
    assert.equal(applyRouteReasoningPolicy(requestBody('Res', level), 'Res', { min: 'none', max: 'max' }).effort, level);
  }
});

for (const outbound of protocols) {
  test(`streaming ${outbound} requests enforce and log the same range for each inbound protocol`, async t => {
    const app = await fixture(t, outbound, { handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (outbound === 'Chat') res.end('data: {"id":"fixture","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      else if (outbound === 'Mes') res.end('event: message_start\ndata: {"type":"message_start","message":{"id":"fixture","role":"assistant","content":[],"usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\nevent: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n');
      else res.end('event: response.created\ndata: {"type":"response.created","response":{"id":"fixture","status":"in_progress","output":[]}}\n\nevent: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"id":"fixture","status":"completed","output":[{"type":"message","id":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":1,"output_tokens":1}}}\n\n');
    } });
    let expectedLogs = 0;
    for (const inbound of protocols) {
      const response = await app.call(inbound, { ...requestBody(inbound, 'max'), stream: true });
      assert.equal(response.status, 200);
      assert.match(response.body, /ok/);
      assert.equal(app.captured.at(-1).body.stream, true);
      assert.equal(effortOf(outbound, app.captured.at(-1).body), 'high');
      expectedLogs++;
      let logs = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        await app.store.writeQueue;
        logs = (await app.store.read()).usage;
        if (logs.length >= expectedLogs) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(logs.length, expectedLogs);
      const log = logs.at(-1);
      assert.equal(log.reasoningEffort, 'high');
      assert.equal(log.status, 'completed');
    }
  });
}
