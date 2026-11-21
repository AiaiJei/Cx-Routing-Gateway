import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRequestMetrics } from '../../services/gateway/src/request-metrics.mjs';

const frame = (data, event = '') => `${event ? `event: ${event}\r\n` : ''}data: ${JSON.stringify(data)}\r\n\r\n`;

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
  metrics.push(Buffer.from(frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }) + frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }) + frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 50, tokens: { input: 10, output: 3, total: 13 }, streamCompletion: 'completed', outputObserved: true, usageObserved: true });
});

test('Mes start/delta usage merges cumulative fields without summing snapshots', () => {
  let now = 101;
  const metrics = createRequestMetrics({ protocol: 'Mes', stream: true, startedAt: 100, clock: () => now });
  metrics.push(Buffer.from(frame({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 5 } } })));
  assert.equal(metrics.snapshot().firstTokenMs, undefined);
  now = 125;
  metrics.push(Buffer.from(frame({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } })));
  metrics.push(Buffer.from(frame({ type: 'message_delta', usage: { output_tokens: 6 } }) + frame({ type: 'message_delta', usage: { output_tokens: 7 } }) + frame({ type: 'message_stop' }, 'message_stop')));
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 25, tokens: { input: 10, output: 7, cacheRead: 0, cacheWrite: 5, total: 22 }, streamCompletion: 'completed', outputObserved: true, usageObserved: true });
});

test('Responses records generation but ignores lifecycle and recognizes nested completion usage', () => {
  let now = 105;
  const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 100, clock: () => now });
  metrics.push(Buffer.from(frame({ type: 'response.created', response: { status: 'in_progress' } })));
  now = 132;
  metrics.push(Buffer.from(frame({ type: 'response.reasoning_summary_text.delta', delta: 'thinking' })));
  metrics.push(Buffer.from(frame({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 12, output_tokens: 4, output_tokens_details: { reasoning_tokens: 2 } } } })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 32, tokens: { input: 12, output: 4, total: 16, reasoning: 2 }, streamCompletion: 'completed', outputObserved: true, usageObserved: true });
});

test('malformed and oversized frames are skipped without losing following metrics', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 10, clock: () => 15 });
  metrics.push(Buffer.from('data: {bad}\n\ndata: ' + 'x'.repeat(300_000)));
  metrics.push(Buffer.from('\n\n' + frame({ choices: [{ delta: { refusal: 'no' } }], usage: { prompt_tokens: 0, completion_tokens: 1 } }) + frame({ choices: [{ delta: {}, finish_reason: 'content_filter' }] })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 5, tokens: { input: 0, output: 1, total: 1 }, streamCompletion: 'completed', outputObserved: true, usageObserved: true });
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

test('Chat DONE without a finish reason is incomplete', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 10 });
  metrics.push(Buffer.from('data: [DONE]\n\n'));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, streamCompletion: 'incomplete', outputObserved: false, usageObserved: false });
});

test('Chat finish reason completes a stream and records observable output', () => {
  const metrics = createRequestMetrics({ protocol: 'Chat', stream: true, startedAt: 10, clock: () => 15 });
  metrics.push(Buffer.from(frame({ choices: [{ delta: { content: 'hello' } }] })));
  metrics.push(Buffer.from(frame({ choices: [{ delta: {}, finish_reason: 'stop' }] })));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, firstTokenMs: 5, streamCompletion: 'completed', outputObserved: true, usageObserved: false });
});

test('Messages message_stop is required for stream completion', () => {
  const metrics = createRequestMetrics({ protocol: 'Mes', stream: true, startedAt: 10 });
  metrics.push(Buffer.from(frame({ type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } })));
  metrics.push(Buffer.from(frame({ type: 'message_stop' }, 'message_stop')));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, tokens: { input: 1, output: 0 }, streamCompletion: 'completed', outputObserved: false, usageObserved: true });
});

test('Responses failed and incomplete events do not count as completed', () => {
  for (const [event, status] of [['response.failed', 'failed'], ['response.incomplete', 'incomplete']]) {
    const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 10 });
    metrics.push(Buffer.from(frame({ type: event, response: { status: event === 'response.failed' ? 'failed' : 'incomplete' } }, event)));
    metrics.finish();
    assert.deepEqual(metrics.snapshot(), { stream: true, streamCompletion: status, outputObserved: false, usageObserved: false });
  }
});

test('Responses completion can be valid while output and usage are absent', () => {
  const metrics = createRequestMetrics({ protocol: 'Res', stream: true, startedAt: 10 });
  metrics.push(Buffer.from(frame({ type: 'response.completed', response: { status: 'completed', output: [] } }, 'response.completed')));
  metrics.finish();
  assert.deepEqual(metrics.snapshot(), { stream: true, streamCompletion: 'completed', outputObserved: false, usageObserved: false });
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
