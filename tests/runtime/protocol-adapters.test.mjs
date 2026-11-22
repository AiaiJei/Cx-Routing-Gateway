import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, serializeRequest, parseResponse, serializeResponse } from '../../services/gateway/src/protocol-adapters.mjs';
import { parseStreamEvent, serializeStreamEvent } from '../../services/gateway/src/protocol-adapters.mjs';

const profile = { direction: 'Res->Chat', supportsResponseFormat: true, supportsToolChoice: true };

test('normalizes Responses text, tools, tool choice and response format', () => {
  const normalized = parseRequest('Res', {
    model: 'codex-model',
    instructions: 'be concise',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    tools: [{ type: 'function', name: 'lookup', description: 'Look up a value', parameters: { type: 'object' } }],
    tool_choice: { type: 'function', name: 'lookup' },
    text: { format: { type: 'json_schema', name: 'answer', schema: { type: 'object' } } },
    max_output_tokens: 128,
  }, profile);
  assert.equal(normalized.instructions, 'be concise');
  assert.equal(normalized.messages[0].content, 'hello');
  assert.deepEqual(normalized.tools, [{ name: 'lookup', description: 'Look up a value', parameters: { type: 'object' } }]);
  assert.deepEqual(normalized.toolChoice, { mode: 'function', name: 'lookup' });
  assert.deepEqual(normalized.responseFormat, { type: 'json_schema', name: 'answer', schema: { type: 'object' } });
  assert.equal(normalized.maxTokens, 128);
});

test('serializes the normalized Codex request to Chat without dropping supported controls', () => {
  const payload = serializeRequest('Chat', {
    messages: [{ role: 'user', content: 'hello' }],
    instructions: 'be concise',
    tools: [{ name: 'lookup', description: 'Look up', parameters: { type: 'object' } }],
    toolChoice: { mode: 'required' },
    responseFormat: { type: 'json_object' },
    maxTokens: 128,
  }, 'deepseek-model', profile);
  assert.equal(payload.model, 'deepseek-model');
  assert.equal(payload.messages[0].role, 'system');
  assert.deepEqual(payload.tools[0].function.parameters, { type: 'object' });
  assert.deepEqual(payload.tool_choice, 'required');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
});

test('round-trips tool calls from Chat response to Responses response', () => {
  const normalized = parseResponse('Chat', { id: 'chat-1', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-1', function: { name: 'lookup', arguments: '{"key":"x"}' } }] } }] });
  const response = serializeResponse('Res', normalized, 'req-1', profile);
  assert.equal(response.id, 'chat-1');
  assert.equal(response.output[0].type, 'function_call');
  assert.equal(response.output[0].call_id, 'call-1');
  assert.equal(response.output[0].name, 'lookup');
});

test('parses tool choices from all three protocols into the normalized contract', () => {
  const cases = [
    ['Res', { input: 'x', tool_choice: { type: 'function', name: 'lookup' } }, { mode: 'function', name: 'lookup' }],
    ['Mes', { messages: [{ role: 'user', content: 'x' }], tool_choice: { type: 'tool', name: 'lookup' } }, { mode: 'function', name: 'lookup' }],
    ['Chat', { messages: [{ role: 'user', content: 'x' }], tool_choice: { type: 'function', function: { name: 'lookup' } } }, { mode: 'function', name: 'lookup' }],
  ];
  for (const [protocol, body, expected] of cases) assert.deepEqual(parseRequest(protocol, body).toolChoice, expected);
});

test('serializes normalized tool choice and JSON schema for every destination protocol', () => {
  const normalized = { messages: [{ role: 'user', content: 'hello' }], instructions: 'be concise', tools: [{ name: 'lookup', description: 'Look up', parameters: { type: 'object' } }], toolChoice: { mode: 'function', name: 'lookup' }, responseFormat: { type: 'json_schema', name: 'answer', schema: { type: 'object' }, strict: true }, maxTokens: 32 };
  const chat = serializeRequest('Chat', normalized, 'chat-model');
  const mes = serializeRequest('Mes', normalized, 'mes-model');
  const res = serializeRequest('Res', normalized, 'res-model');
  assert.deepEqual(chat.tool_choice, { type: 'function', function: { name: 'lookup' } });
  assert.equal(chat.response_format.json_schema.strict, true);
  assert.deepEqual(mes.tool_choice, { type: 'tool', name: 'lookup' });
  assert.deepEqual(mes.output_config.format.schema, { type: 'object' });
  assert.deepEqual(res.tool_choice, { type: 'function', name: 'lookup' });
  assert.deepEqual(res.text.format.schema, { type: 'object' });
  assert.equal(res.instructions, 'be concise');
});

test('parses and serializes normalized tool calls for Chat, Messages and Responses', () => {
  const source = [
    ['Chat', { id: 'c1', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-1', function: { name: 'lookup', arguments: '{"key":"x"}' } }] } }] }],
    ['Mes', { id: 'm1', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call-1', name: 'lookup', input: { key: 'x' } }] }],
    ['Res', { id: 'r1', status: 'completed', output: [{ type: 'function_call', call_id: 'call-1', name: 'lookup', arguments: '{"key":"x"}' }] }],
  ];
  for (const [protocol, body] of source) {
    const normalized = parseResponse(protocol, body);
    for (const target of ['Res', 'Mes', 'Chat']) {
      const result = serializeResponse(target, normalized, 'req-1');
      assert.ok(JSON.stringify(result).includes('call-1'), protocol + ' to ' + target + ' lost the tool call id');
      assert.ok(JSON.stringify(result).includes('lookup'), protocol + ' to ' + target + ' lost the tool name');
    }
  }
});

test('reports unsupported multiple candidates with the exact field and direction', () => {
  assert.throws(() => parseRequest('Res', { model: 'x', input: 'hello', n: 2 }, { direction: 'Res->Chat' }), (error) => {
    assert.equal(error.code, 'multiple_candidates_unsupported');
    assert.equal(error.field, 'n');
    assert.equal(error.direction, 'Res->Chat');
    return true;
  });
});

test('normalizes Anthropic tool_choice auto, any and named tool controls', () => {
  assert.deepEqual(parseRequest('Mes', { messages: [], tool_choice: { type: 'auto' } }).toolChoice, { mode: 'auto' });
  assert.deepEqual(parseRequest('Mes', { messages: [], tool_choice: { type: 'any' } }).toolChoice, { mode: 'required' });
  assert.deepEqual(parseRequest('Mes', { messages: [], tool_choice: { type: 'tool', name: 'lookup' } }).toolChoice, { mode: 'function', name: 'lookup' });
});

test('rejects non-text Res content with a safe field and direction instead of dropping it', () => {

test('normalizes Chat tool stream deltas and serializes them to Responses events', () => {
  const state = { nextToolIndex: 0, toolIndexes: new Map() };
  const event = parseStreamEvent('Chat', '', { choices: [{ delta: { tool_calls: [{ index: 2, id: 'call-2', function: { name: 'lookup', arguments: '{"key":' } }] } }] }, state);
  assert.deepEqual(event, { type: 'tools', tools: [{ index: 2, id: 'call-2', name: 'lookup', arguments: '{"key":' }] });
  const wire = serializeStreamEvent('Res', event, 'req-1', state);
  assert.match(wire, /response.output_item.added/);
  assert.match(wire, /response.function_call_arguments.delta/);
  assert.match(wire, /call-2/);
});
  assert.throws(() => parseRequest('Res', { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.invalid/image' }] }] }, { direction: 'Res->Chat' }), (error) => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.field, 'input.content');
    assert.equal(error.direction, 'Res->Chat');
    return true;
  });
});
