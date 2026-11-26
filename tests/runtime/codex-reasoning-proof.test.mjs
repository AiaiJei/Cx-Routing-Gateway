import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';

const protocols = ['Res', 'Chat', 'Mes'];
const effortFields = { Res: value => ({ reasoning: { effort: value } }), Chat: value => ({ reasoning_effort: value }), Mes: value => ({ output_config: { effort: value } }) };
const effortOf = (protocol, body) => protocol === 'Res' ? body.reasoning?.effort : protocol === 'Chat' ? body.reasoning_effort : body.output_config?.effort;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); });
async function fixture(t) {
  const root = path.resolve('.tmp/codex-memory-effort-20261126');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'http-proof-'));
  const store = new ConfigStore(path.join(directory, 'runtime.json'));
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    requests.push({ path: req.url, body });
    res.setHeader('content-type', 'application/json');
    const usage = { input_tokens: 2, output_tokens: 1 };
    if (req.url === '/v1/responses') res.end(JSON.stringify({ id: 'response-fixture', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }], usage }));
    else if (req.url === '/v1/messages') res.end(JSON.stringify({ id: 'message-fixture', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage }));
    else res.end(JSON.stringify({ id: 'chat-fixture', choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1 } }));
  });
  const upstreamPort = await listen(upstream);
  const token = 'inert-local-proof-key';
  const routes = protocols.flatMap(inbound => protocols.map(outbound => ({ id: inbound + '-' + outbound, alias: inbound + '-' + outbound, inboundProtocol: inbound, outboundProtocol: outbound, upstreamId: 'up', modelId: 'local-fixture-model', enabled: true })));
  await store.update(config => ({ ...config,
    upstreams: [{ id: 'up', name: 'Loopback fixture', enabled: true, baseUrl: 'http://127.0.0.1:' + upstreamPort, trustedPrivateNetwork: true, approvedAddresses: ['127.0.0.1'] }],
    routes, clientKeys: [{ id: 'proof-key', enabled: true, scope: [], keyHash: crypto.createHash('sha256').update(token).digest('hex') }],
  }));
  const gateway = createGatewayServer({ store, vault: {} });
  const gatewayPort = await listen(gateway);
  t.after(async () => { await Promise.all([close(gateway), close(upstream)]); await store.writeQueue; });
  return {
    requests,
    async request(inbound, outbound, fields) {
      const endpoint = { Res: 'responses', Chat: 'chat/completions', Mes: 'messages' }[inbound];
      const response = await fetch('http://127.0.0.1:' + gatewayPort + '/v1/' + endpoint, {
        method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ model: inbound + '-' + outbound, input: 'private-fixture-prompt', messages: [{ role: 'user', content: 'private-fixture-prompt' }], ...fields }),
      });
      assert.equal(response.status, 200);
      await response.json();
    },
    async logs(count) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const usage = (await store.read()).usage;
        if (usage.length >= count) return usage;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.fail('Gateway did not persist the expected local request log');
    },
  };
}

test('actual Gateway HTTP forwards every standard effort to all destination protocols and records the inbound value', async t => {
  const app = await fixture(t);
  let count = 0;
  for (const source of protocols) for (const target of protocols) for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']) {
    await app.request(source, target, effortFields[source](effort));
    const forwarded = app.requests.at(-1);
    assert.equal(forwarded.path, { Res: '/v1/responses', Chat: '/v1/chat/completions', Mes: '/v1/messages' }[target]);
    assert.equal(effortOf(target, forwarded.body), effort, source + '->' + target + ' actual POST effort');
    assert.equal(forwarded.body.model, 'local-fixture-model');
    const log = (await app.logs(++count)).at(-1);
    assert.equal(log.reasoningEffort, effort);
    assert.equal(log.inboundProtocol, source);
    assert.equal(log.outboundProtocol, target);
    assert.equal(log.status, 'completed');
    assert.doesNotMatch(JSON.stringify(log), /private-fixture-prompt|inert-local-proof-key|authorization|requestBody/);
  }
  assert.equal(app.requests.length, 54);
});

test('actual converted requests omit invalid or absent effort while same-protocol payloads retain their fields', async t => {
  const app = await fixture(t);
  let count = 0;
  for (const source of protocols) for (const target of protocols.filter(item => item !== source)) {
    for (const value of [undefined, '', 'x'.repeat(33), 7]) {
      await app.request(source, target, value === undefined ? {} : effortFields[source](value));
      assert.equal(effortOf(target, app.requests.at(-1).body), undefined);
      assert.equal('reasoningEffort' in (await app.logs(++count)).at(-1), false);
    }
  }
  await app.request('Res', 'Res', { reasoning: { effort: ' high ', summary: 'auto' }, metadata: { fixture: 'keep' } });
  assert.deepEqual(app.requests.at(-1).body.reasoning, { effort: ' high ', summary: 'auto' });
  assert.deepEqual(app.requests.at(-1).body.metadata, { fixture: 'keep' });
});
