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

test('round-trips a namespaced Responses function tool through Chat', () => {
  const normalized = parseRequest('Res', {
    input: 'What time is it?',
    tools: [{
      type: 'namespace',
      name: 'mcp__clock',
      description: 'Clock tools',
      tools: [{ type: 'function', name: 'get_time', description: 'Return the current time', parameters: { type: 'object', properties: { timezone: { type: 'string' } } } }],
    }],
    tool_choice: { type: 'function', name: 'get_time', namespace: 'mcp__clock' },
  }, { direction: 'Res->Chat' });

  const targetTool = normalized.tools[0];
  assert.equal(targetTool.name, 'get_time');
  assert.equal(targetTool.namespace, 'mcp__clock');
  assert.ok(targetTool.targetName);
  assert.deepEqual(normalized.toolChoice, { mode: 'function', name: targetTool.targetName });

  const chatRequest = serializeRequest('Chat', normalized, 'chat-model');
  assert.equal(chatRequest.tools[0].function.name, targetTool.targetName);
  assert.deepEqual(chatRequest.tool_choice, { type: 'function', function: { name: targetTool.targetName } });

  const chatResponse = parseResponse('Chat', {
    id: 'chat-namespaced',
    choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-ns-1', function: { name: targetTool.targetName, arguments: '{}' } }] } }],
  }, normalized.tools);
  const responses = serializeResponse('Res', chatResponse, 'req-ns-1');
  assert.equal(responses.output[0].type, 'function_call');
  assert.equal(responses.output[0].name, 'get_time');
  assert.equal(responses.output[0].namespace, 'mcp__clock');
  assert.equal(responses.output[0].call_id, 'call-ns-1');

  const mesRequest = serializeRequest('Mes', normalized, 'messages-model');
  assert.equal(mesRequest.tools[0].name, targetTool.targetName);
  assert.deepEqual(mesRequest.tool_choice, { type: 'tool', name: targetTool.targetName });
  const mesResponse = parseResponse('Mes', {
    id: 'mes-namespaced',
    content: [{ type: 'tool_use', id: 'call-mes-ns-1', name: targetTool.targetName, input: { timezone: 'UTC' } }],
  }, normalized.tools);
  const responsesFromMes = serializeResponse('Res', mesResponse, 'req-mes-ns-1');
  assert.equal(responsesFromMes.output[0].name, 'get_time');
  assert.equal(responsesFromMes.output[0].namespace, 'mcp__clock');
});

test('round-trips namespaced custom tools and their follow-up history through Chat', () => {
  const patchText = '*** Begin Patch\n*** End Patch';
  const tools = [{
    type: 'namespace',
    name: 'mcp__patch',
    tools: [{ type: 'custom', name: 'apply_patch', description: 'Apply a patch', format: { type: 'grammar', syntax: 'lark', definition: 'start: patch' } }],
  }];
  const normalized = parseRequest('Res', { input: 'Apply this patch', tools }, { direction: 'Res->Chat' });
  const customTool = normalized.tools[0];
  assert.equal(customTool.kind, 'custom');
  assert.equal(customTool.namespace, 'mcp__patch');

  const chatRequest = serializeRequest('Chat', normalized, 'chat-model');
  assert.deepEqual(chatRequest.tools[0].function.parameters, {
    type: 'object',
    properties: { input: { type: 'string' } },
    required: ['input'],
    additionalProperties: false,
  });
  assert.match(chatRequest.tools[0].function.description, /start: patch/);
  const mesRequest = serializeRequest('Mes', normalized, 'messages-model');
  assert.equal(mesRequest.tools[0].name, customTool.targetName);
  assert.deepEqual(mesRequest.tools[0].input_schema, chatRequest.tools[0].function.parameters);

  const chatResponse = parseResponse('Chat', {
    id: 'chat-custom',
    choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-custom-1', function: { name: customTool.targetName, arguments: JSON.stringify({ input: patchText }) } }] } }],
  }, normalized.tools);
  const responses = serializeResponse('Res', chatResponse, 'req-custom');
  assert.deepEqual(responses.output[0], {
    type: 'custom_tool_call',
    call_id: 'call-custom-1',
    name: 'apply_patch',
    namespace: 'mcp__patch',
    input: patchText,
  });
  const mesResponse = parseResponse('Mes', {
    id: 'mes-custom',
    content: [{ type: 'tool_use', id: 'call-mes-custom', name: customTool.targetName, input: { input: patchText } }],
  }, normalized.tools);
  const responsesFromMes = serializeResponse('Res', mesResponse, 'req-mes-custom');
  assert.deepEqual(responsesFromMes.output[0], {
    type: 'custom_tool_call',
    call_id: 'call-mes-custom',
    name: 'apply_patch',
    namespace: 'mcp__patch',
    input: patchText,
  });

  const resumed = parseRequest('Res', {
    tools,
    input: [
      { type: 'custom_tool_call', call_id: 'call-custom-1', name: 'apply_patch', namespace: 'mcp__patch', input: patchText },
      { type: 'custom_tool_call_output', call_id: 'call-custom-1', output: 'patch applied' },
    ],
  }, { direction: 'Res->Chat' });
  const resumedChat = serializeRequest('Chat', resumed, 'chat-model');
  assert.deepEqual(resumedChat.messages[0].tool_calls[0], {
    id: 'call-custom-1',
    type: 'function',
    function: { name: customTool.targetName, arguments: JSON.stringify({ input: patchText }) },
  });
  assert.deepEqual(resumedChat.messages[1], { role: 'tool', tool_call_id: 'call-custom-1', content: 'patch applied' });
  const resumedMes = serializeRequest('Mes', resumed, 'messages-model');
  assert.deepEqual(resumedMes.messages, [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call-custom-1', name: customTool.targetName, input: { input: patchText } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-custom-1', content: 'patch applied' }] },
  ]);
});

test('streams namespaced function calls as Responses events with the original namespace', () => {
  const normalized = parseRequest('Res', {
    tools: [{ type: 'namespace', name: 'mcp__calendar', tools: [{ type: 'function', name: 'create_event', parameters: { type: 'object' } }] }],
  }, { direction: 'Res->Chat' });
  const tool = normalized.tools[0];
  const state = { nextToolIndex: 0, toolIndexes: new Map(), toolContext: normalized.tools };
  const event = parseStreamEvent('Chat', '', { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-stream-ns', function: { name: tool.targetName, arguments: '{"date":"today"}' } }] } }] }, state);
  const wire = serializeStreamEvent('Res', event, 'req-stream-ns', state);
  assert.match(wire, /"type":"function_call"/);
  assert.match(wire, /"name":"create_event"/);
  assert.match(wire, /"namespace":"mcp__calendar"/);
  assert.match(wire, /response.function_call_arguments.delta/);
});

test('streams namespaced custom calls as raw Responses custom input', () => {
  const normalized = parseRequest('Res', {
    tools: [{ type: 'namespace', name: 'mcp__patch', tools: [{ type: 'custom', name: 'apply_patch', format: { type: 'text' } }] }],
  }, { direction: 'Res->Chat' });
  const tool = normalized.tools[0];
  const state = { nextToolIndex: 0, toolIndexes: new Map(), toolContext: normalized.tools };
  const delta = parseStreamEvent('Chat', '', { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-stream-custom', function: { name: tool.targetName, arguments: '{"input":"*** Begin Patch\\n*** End Patch"}' } }] } }] }, state);
  const buffered = serializeStreamEvent('Res', delta, 'req-stream-custom', state);
  const done = parseStreamEvent('Chat', '', { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }, state);
  const completed = serializeStreamEvent('Res', done, 'req-stream-custom', state);
  const wire = buffered + completed;
  assert.match(wire, /"type":"custom_tool_call"/);
  assert.match(wire, /"namespace":"mcp__patch"/);
  assert.match(wire, /response.custom_tool_call_input.delta/);
  assert.match(wire, /\*\*\* Begin Patch\\n\*\*\* End Patch/);
});

test('streams Messages custom tool input back to Responses with its namespace', () => {
  const patchText = '*** Begin Patch\n*** End Patch';
  const normalized = parseRequest('Res', {
    tools: [{ type: 'namespace', name: 'mcp__patch', tools: [{ type: 'custom', name: 'apply_patch', format: { type: 'text' } }] }],
  }, { direction: 'Res->Mes' });
  const tool = normalized.tools[0];
  const state = { nextToolIndex: 0, toolIndexes: new Map(), toolContext: normalized.tools };
  const started = parseStreamEvent('Mes', 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call-mes-custom', name: tool.targetName, input: {} } }, state);
  const startFrame = serializeStreamEvent('Res', started, 'req-mes-custom-stream', state);
  const delta = parseStreamEvent('Mes', 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ input: patchText }) } }, state);
  const deltaFrame = serializeStreamEvent('Res', delta, 'req-mes-custom-stream', state);
  const done = parseStreamEvent('Mes', 'message_stop', { type: 'message_stop' }, state);
  const completed = serializeStreamEvent('Res', done, 'req-mes-custom-stream', state);
  const wire = startFrame + deltaFrame + completed;
  assert.match(wire, /"type":"custom_tool_call"/);
  assert.match(wire, /"namespace":"mcp__patch"/);
  assert.match(wire, /response.custom_tool_call_input.delta/);
  const inputDone = wire.split(/\r?\n\r?\n/).find((frame) => frame.includes('response.custom_tool_call_input.done'));
  const payload = JSON.parse(inputDone.split(/\r?\n/).find((line) => line.startsWith('data: ')).slice(6));
  assert.equal(payload.input, patchText);
});

test('namespaced tools with colliding flattened names receive distinct target names', () => {
  const normalized = parseRequest('Res', {
    tools: [
      { type: 'namespace', name: 'mcp__tools', tools: [{ type: 'function', name: 'list', parameters: { type: 'object' } }] },
      { type: 'namespace', name: 'mcp', tools: [{ type: 'function', name: 'tools__list', parameters: { type: 'object' } }] },
    ],
  }, { direction: 'Res->Chat' });
  assert.notEqual(normalized.tools[0].targetName, normalized.tools[1].targetName);
  assert.ok(normalized.tools.every((tool) => tool.targetName.length <= 64));
});

test('accepts a Responses function tool with no parameters as an empty object schema', () => {
  const normalized = parseRequest('Res', { tools: [{ type: 'function', name: 'ping' }] }, { direction: 'Res->Chat' });
  assert.deepEqual(normalized.tools[0].parameters, { type: 'object', properties: {} });
});

test('rejects malformed Responses custom tool formats with a field-specific error', () => {
  const formats = [
    null,
    { type: 'grammar' },
    { type: 'grammar', syntax: 'peg', definition: 'start: WORD' },
    { type: 'grammar', syntax: 'lark', definition: '' },
  ];
  for (const format of formats) {
    assert.throws(() => parseRequest('Res', {
      tools: [{ type: 'custom', name: 'emit', format }],
    }, { direction: 'Res->Chat' }), (error) => {
      assert.equal(error.field, 'tools.format');
      assert.equal(error.direction, 'Res->Chat');
      return true;
    });
  }
});

test('rejects an unrepresentable Responses built-in tool with its field and direction', () => {
  assert.throws(() => parseRequest('Res', { tools: [{ type: 'web_search_preview' }] }, { direction: 'Res->Chat' }), (error) => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.field, 'tools.type');
    assert.equal(error.direction, 'Res->Chat');
    return true;
  });
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
    ['Res', { input: 'x', tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }], tool_choice: { type: 'function', name: 'lookup' } }, { mode: 'function', name: 'lookup' }],
    ['Mes', { messages: [{ role: 'user', content: 'x' }], tool_choice: { type: 'tool', name: 'lookup' } }, { mode: 'function', name: 'lookup' }],
    ['Chat', { messages: [{ role: 'user', content: 'x' }], tool_choice: { type: 'function', function: { name: 'lookup' } } }, { mode: 'function', name: 'lookup' }],
  ];
  for (const [protocol, body, expected] of cases) assert.deepEqual(parseRequest(protocol, body).toolChoice, expected);
});

test('rejects undeclared Responses function choices when no tools are provided', () => {
  for (const toolChoice of [
    { type: 'function', name: 'missing' },
    { type: 'function', namespace: 'mcp__missing', name: 'run' },
  ]) {
    assert.throws(() => parseRequest('Res', { tool_choice: toolChoice }, { direction: 'Res->Chat' }), (error) => {
      assert.equal(error.field, 'tool_choice');
      assert.equal(error.direction, 'Res->Chat');
      return true;
    });
  }
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
