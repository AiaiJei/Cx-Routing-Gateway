import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { saveRouteBatch } from '../../services/local-control/src/route-service.mjs';
const require = createRequire(import.meta.url);
const { catalogData } = require('../../apps/desktop/electron/codex-model-catalog.cjs');
const config = { upstreams: [{ id: 'a' }], routes: [] };
const input = { inboundProtocol: 'Res', outboundProtocol: 'Chat', targets: [{ upstreamId: 'a', modelId: 'vision' }] };
const capabilities = { contextWindow: 128000, maxOutputTokens: 8192, inputModalities: ['text', 'image'], reasoningEfforts: ['low', 'high'], tools: true };

test('capabilities persist per route, survive omitted updates and clear explicitly', () => {
  const saved = saveRouteBatch(config, { ...input, modelCapabilities: [{ modelId: 'vision', capabilities }] });
  assert.deepEqual(saved.routes[0].capabilities, capabilities);
  const kept = saveRouteBatch(saved.config, input);
  assert.deepEqual(kept.routes[0].capabilities, capabilities);
  const cleared = saveRouteBatch(kept.config, { ...input, modelCapabilities: [{ modelId: 'vision', capabilities: null }] });
  assert.equal(Object.hasOwn(cleared.routes[0], 'capabilities'), false);
});

test('invalid or conflicting capabilities reject the whole route batch', () => {
  for (const invalid of [null, [], { contextWindow: 0 }, { contextWindow: 1.5 }, { contextWindow: '128000' }, { contextWindow: 100, maxOutputTokens: 101 }, { maxOutputTokens: 100000001 }, { inputModalities: ['image'] }, { inputModalities: ['text','audio'] }, { inputModalities: ['text','text'] }, { reasoningEfforts: ['ultra'] }, { reasoningEfforts: ['low','low'] }, { tools: 'yes' }, { invented: true }]) {
    if (invalid === null) continue;
    assert.throws(() => saveRouteBatch(config, { ...input, modelCapabilities: [{ modelId: 'vision', capabilities: invalid }] }), { statusCode: 400 });
  }
  for (const entries of [null, {}, [{ modelId: 'other', capabilities }], [{ modelId: 'vision', capabilities }, { modelId: 'vision', capabilities }]]) {
    assert.throws(() => saveRouteBatch(config, { ...input, modelCapabilities: entries }), { statusCode: 400 });
  }
  assert.throws(() => saveRouteBatch(config, { ...input, modelReasoning: [{ modelId: 'vision', min: 'max', max: 'max' }], modelCapabilities: [{ modelId: 'vision', capabilities }] }), { statusCode: 400 });
});

test('Codex catalog advertises per-model vision/context and intersects capability efforts with routing interval', () => {
  const data = catalogData(['r'], 'r', ['vision'], 'Generic instructions', 'gateway', [{ min: 'medium', max: 'max' }], [capabilities]);
  assert.equal(data._cxrg.version, 4);
  assert.equal(data.models[0].context_window, 128000);
  assert.equal(data.models[0].max_context_window, 128000);
  assert.deepEqual(data.models[0].input_modalities, ['text','image']);
  assert.deepEqual(data.models[0].supported_reasoning_levels.map(x=>x.effort), ['high']);
  assert.equal(data.models[0].default_reasoning_level, 'high');
  assert.equal(data.models[0].max_output_tokens, undefined, 'Codex ModelInfo does not implement this field');
  assert.deepEqual(data._cxrg.capabilities, [capabilities]);
  const noReasoning = catalogData(['r'], 'r', ['plain'], 'Generic instructions', 'gateway', [null], [{ reasoningEfforts: [] }]);
  assert.deepEqual(noReasoning.models[0].supported_reasoning_levels, []);
  assert.equal(noReasoning.models[0].default_reasoning_level, null);
});
