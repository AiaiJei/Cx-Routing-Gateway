import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRequestMetrics } from '../../services/gateway/src/request-metrics.mjs';

const frame = (data, event = '') => `${event ? `event: ${event}\r\n` : ''}data: ${JSON.stringify(data)}\r\n\r\n`;

test('usage diagnostics distinguish missing, invalid, partial and reported zeros without retaining payloads', () => {
  for (const [usage, status] of [[undefined, 'missing'], [{}, 'invalid'], [{ input_tokens: 'secret' }, 'invalid'], [{ input_tokens: 3 }, 'partial'], [{ input_tokens: 0, output_tokens: 0 }, 'reported']]) {
    const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 0 });
    metrics.push(Buffer.from(frame({ type: 'response.completed', response: { usage } })));
    metrics.finish();
    assert.equal(metrics.usageDiagnostic().status, status);
    assert.equal(JSON.stringify(metrics.usageDiagnostic()).includes('secret'), false);
  }
});

test('an empty top-level usage must not hide valid nested Responses completion usage', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 0 });
  metrics.push(Buffer.from(frame({ type: 'response.completed', usage: {}, response: { usage: { input_tokens: 3, output_tokens: 2 } } })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot().tokens, { input: 3, output: 2, total: 5 });
  assert.deepEqual(metrics.usageDiagnostic().sources, ['usage', 'response.usage']);
});

test('a later invalid core usage value does not leave a stale token count or total', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } });
  metrics.observeJson({ usage: { output_tokens: 'private-invalid-value' } });
  assert.deepEqual(metrics.snapshot(), { stream: false, tokens: { input: 10 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'partial', sources: ['usage'], missingFields: ['output_tokens'], invalidFields: ['output_tokens'] });
});

test('a later valid nested usage detail clears a previous malformed-parent diagnostic', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: 'private-invalid-parent' } });
  metrics.observeJson({ usage: { input_tokens_details: { cached_tokens: 4 } } });
  assert.deepEqual(metrics.snapshot(), { stream: false, tokens: { input: 10, output: 2, cacheRead: 4, total: 12 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['usage'], missingFields: [], invalidFields: [] });
});

test('a later valid usage object clears a previous malformed usage marker', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: 'private-invalid-usage' });
  metrics.observeJson({ usage: { input_tokens: 3, output_tokens: 2 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['usage'], missingFields: [], invalidFields: [] });
});

test('a later malformed usage container does not display stale numbers from an earlier frame', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } });
  metrics.observeJson({ usage: 'private-invalid-usage' });
  assert.deepEqual(metrics.snapshot(), { stream: false });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'invalid', sources: ['usage'], missingFields: ['input_tokens', 'output_tokens'], invalidFields: ['usage'] });
});

test('an invalid Messages cache breakdown invalidates a stale reported total', () => {
  const metrics = createRequestMetrics({ protocol: 'Mes', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2, total_tokens: 20 } });
  assert.equal(metrics.snapshot().tokens.total, 20);
  metrics.observeJson({ usage: { input_tokens_details: 'private-invalid-details' } });
  assert.deepEqual(metrics.snapshot(), { stream: false, tokens: { input: 10, output: 5, cacheWrite: 2 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['usage'], missingFields: [], invalidFields: ['input_tokens_details'] });
});

test('a malformed optional Messages detail does not erase a valid top-level cache count', () => {
  const metrics = createRequestMetrics({ protocol: 'Mes', stream: false, startedAt: 0 });
  metrics.observeJson({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2, total_tokens: 20, input_tokens_details: 'private-invalid-details' } });
  assert.deepEqual(metrics.snapshot(), { stream: false, tokens: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, total: 20 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['usage'], missingFields: [], invalidFields: ['input_tokens_details'] });
});

test('JSON usage is allowlisted across Chat, Res and Mes, including zeros and cache breakdowns', () => {
  const cases = [
    ['Chat', { prompt_tokens: 100, completion_tokens: 12, total_tokens: 112, prompt_tokens_details: { cached_tokens: 80, audio_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 4 }, secret: 'never-log' }, { input: 100, output: 12, total: 112, cacheRead: 80, inputAudio: 0, reasoning: 4 }],
    ['Res', { input_tokens: 20, output_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }, { input: 20, output: 0, cacheRead: 0, reasoning: 0, total: 20 }],
    ['Mes', { input_tokens: 10, output_tokens: 6, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 } }, { input: 10, output: 6, cacheRead: 20, cacheWrite: 30, cacheWrite5m: 10, cacheWrite1h: 20, total: 66 }],
  ];
  for (const [protocol, usage, expected] of cases) {
    const metrics = createRequestMetrics({ protocol, stream: false, startedAt: 100 });
    metrics.observeJson({ usage, content: 'private-body' });
    assert.deepEqual(metrics.snapshot(), { stream: false, tokens: expected });
    assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['usage'], missingFields: [], invalidFields: [] });
  }
});

test('invalid and absent values remain unknown; explicit zero survives', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: false, startedAt: 100 });
  metrics.observeJson({ usage: { prompt_tokens: -1, completion_tokens: '2', total_tokens: Infinity, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 1.5 } } });
  assert.deepEqual(metrics.snapshot(), { stream: false, tokens: { cacheRead: 0 } });
  const absent = createRequestMetrics({ protocol: 'Res', stream: false, startedAt: 100 });
  absent.observeJson({ output: [] });
  assert.deepEqual(absent.snapshot(), { stream: false });
});

test('stream first token ignores role, heartbeat and usage; chunked UTF-8 and latest totals work', () => {
  let now = 110;
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 100, clock: () => now });
  metrics.push(Buffer.from(': heartbeat\r\n\r\n' + frame({ choices: [{ delta: { role: 'assistant', content: '' } }] })));
  now = 150;
  const text = Buffer.from(frame({ choices: [{ delta: { content: '你好' } }] }));
  for (const byte of text) metrics.push(Uint8Array.of(byte));
  now = 180;
  metrics.push(Buffer.from(frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }) + frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }) + 'data: [DONE]\n\n'));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 50, tokens: { input: 10, output: 3, total: 13 } });
});

test('Mes start/delta usage merges cumulative fields without summing snapshots', () => {
  let now = 101;
  const metrics = createRequestMetrics({ protocol: 'Mes', stream: true, startedAt: 100, clock: () => now });
  metrics.push(Buffer.from(frame({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 5 } } })));
  assert.equal(metrics.snapshot().firstTokenMs, undefined);
  now = 125;
  metrics.push(Buffer.from(frame({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } })));
  metrics.push(Buffer.from(frame({ type: 'message_delta', usage: { output_tokens: 6 } }) + frame({ type: 'message_delta', usage: { output_tokens: 7 } })));
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 25, tokens: { input: 10, output: 7, cacheRead: 0, cacheWrite: 5, total: 22 } });
  assert.deepEqual(metrics.usageDiagnostic(), { status: 'reported', sources: ['message.usage', 'usage'], missingFields: [], invalidFields: [] });
});

test('Responses records generation but ignores lifecycle and recognizes nested completion usage', () => {
  let now = 105;
  const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 100, clock: () => now });
  metrics.push(Buffer.from(frame({ type: 'response.created', response: { status: 'in_progress' } })));
  now = 132;
  metrics.push(Buffer.from(frame({ type: 'response.reasoning_summary_text.delta', delta: 'thinking' })));
  metrics.push(Buffer.from(frame({ type: 'response.completed', response: { usage: { input_tokens: 12, output_tokens: 4, output_tokens_details: { reasoning_tokens: 2 } } } })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 32, tokens: { input: 12, output: 4, total: 16, reasoning: 2 } });
});

test('malformed and oversized frames are skipped without losing following metrics', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 10, clock: () => 15 });
  metrics.push(Buffer.from('data: {bad}\n\ndata: ' + 'x'.repeat(300_000)));
  metrics.push(Buffer.from('\n\n' + frame({ choices: [{ delta: { refusal: 'no' } }], usage: { prompt_tokens: 0, completion_tokens: 1 } })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 5, tokens: { input: 0, output: 1, total: 1 } });
});

test('later cumulative updates invalidate stale reported totals', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 100 });
  metrics.push(Buffer.from(frame({ usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } })));
  metrics.push(Buffer.from(frame({ usage: { completion_tokens: 3 } })));
  assert.deepEqual(metrics.snapshot().tokens, { input: 10, output: 3, total: 13 });
});

test('Mes totals stay unknown when cache components are missing or invalid', () => {
  for (const cache of [undefined, -1, '0']) {
    const metrics = createRequestMetrics({ protocol: 'Mes', stream: false, startedAt: 100 });
    metrics.observeJson({ usage: { input_tokens: 10, output_tokens: 6, cache_read_input_tokens: cache, cache_creation_input_tokens: 0 } });
    assert.deepEqual(metrics.snapshot().tokens, { input: 10, output: 6, cacheWrite: 0 });
  }
});

test('default stream metrics ignore wall-clock jumps', async () => {
  const originalDateNow = Date.now;
  const startedAt = performance.now();
  let wallTime = startedAt;
  Date.now = () => wallTime;
  try {
    const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt });
    await new Promise(resolve => setTimeout(resolve, 20));
    wallTime = startedAt - 10_000;
    metrics.push(Buffer.from(frame({ choices: [{ delta: { content: 'first' } }] })));
    assert.ok(metrics.snapshot().firstTokenMs > 0, `expected monotonic elapsed time, got ${metrics.snapshot().firstTokenMs}`);
    assert.ok(metrics.snapshot().firstTokenMs < 1000);
  } finally {
    Date.now = originalDateNow;
  }
});
