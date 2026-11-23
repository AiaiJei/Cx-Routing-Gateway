import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, serializeRequest, parseResponse, serializeResponse } from '../../services/gateway/src/protocol-adapters.mjs';
import { parseStreamEvent, serializeStreamEvent } from '../../services/gateway/src/protocol-adapters.mjs';

const profile = { direction: 'Res->Chat', supportsResponseFormat: true, supportsToolChoice: true };

function assertToolSearchSchema(tool) {
  assert.ok(tool, 'tool_search should be exposed as a Chat function');
  assert.equal(tool.type, 'function');
  const schema = tool.function.parameters;
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties?.query?.type, 'string');
  assert.equal(schema.properties?.limit?.type, 'integer');
  assert.ok(Array.isArray(schema.required));
  assert.ok(schema.required.includes('query'));
  assert.equal(schema.required.includes('limit'), false);
}

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

test('converts Responses tool_search into a callable Chat schema', () => {
  const normalized = parseRequest('Res', { input: 'find a tool', tools: [{ type: 'tool_search' }] }, { direction: 'Res->Chat' });
  const chat = serializeRequest('Chat', normalized, 'chat-model');
  assert.equal(chat.tools.length, 1);
  assert.equal(chat.tools[0].function.name, 'tool_search');
  assertToolSearchSchema(chat.tools[0]);
});

test('preserves tool_search call/output history and exposes returned definitions as Chat tools', () => {
  const returnedTools = [{ type: 'function', name: 'lookup', description: 'Find a value', parameters: { type: 'object', properties: { key: { type: 'string' } } } }];
  const normalized = parseRequest('Res', { tools: [{ type: 'tool_search' }], input: [
    { type: 'tool_search_call', call_id: 'search-1', execution: 'client', arguments: { query: 'lookup', limit: 2 } },
    { type: 'tool_search_output', call_id: 'search-1', execution: 'client', status: 'completed', tools: returnedTools },
  ] }, { direction: 'Res->Chat' });
  const chat = serializeRequest('Chat', normalized, 'chat-model');
  assert.deepEqual(chat.messages[0].tool_calls, [{ id: 'search-1', type: 'function', function: { name: 'tool_search', arguments: JSON.stringify({ query: 'lookup', limit: 2 }) } }]);
  assert.equal(chat.messages[1].role, 'tool');
  assert.equal(chat.messages[1].tool_call_id, 'search-1');
  assert.deepEqual(JSON.parse(chat.messages[1].content), { status: 'completed', tools: returnedTools });
  assertToolSearchSchema(chat.tools.find((tool) => tool.function?.name === 'tool_search'));
  const lookup = chat.tools.find((tool) => tool.function?.name === 'lookup');
  assert.equal(lookup?.type, 'function');
  assert.equal(lookup.function.parameters.type, 'object');
  assert.equal(lookup.function.parameters.properties.key.type, 'string');
});

test('consumes additional_tools input carriers while preserving ordinary history and callable children', () => {
  const normalized = parseRequest('Res', {
    instructions: 'Use the available tools.',
    input: [
      { role: 'user', content: 'Find a value.' },
      { type: 'additional_tools', tools: [{ type: 'namespace', name: 'mcp__mixed', tools: [
        { type: 'function', name: 'lookup', parameters: { type: 'object', properties: { key: { type: 'string' } } } },
        { type: 'custom', name: 'apply_patch', format: { type: 'text' } },
      ] }] },
      { role: 'assistant', content: 'Tools are ready.' },
      { role: 'user', content: 'Continue.' },
    ],
  }, { direction: 'Res->Chat' });
  const chat = serializeRequest('Chat', normalized, 'chat-model');
  assert.deepEqual(chat.messages, [
    { role: 'system', content: 'Use the available tools.' },
    { role: 'user', content: 'Find a value.' },
    { role: 'assistant', content: 'Tools are ready.' },
    { role: 'user', content: 'Continue.' },
  ]);
  assert.deepEqual(normalized.tools.map(({ name, namespace, kind }) => ({ name, namespace, kind })), [
    { name: 'lookup', namespace: 'mcp__mixed', kind: 'function' },
    { name: 'apply_patch', namespace: 'mcp__mixed', kind: 'custom' },
  ]);
  assert.equal(chat.tools.length, 2);
  for (const descriptor of normalized.tools) {
    const callable = chat.tools.find((tool) => tool.function?.name === (descriptor.targetName || descriptor.name));
    assert.equal(callable?.type, 'function');
    assert.equal(callable.function.parameters.type, 'object');
    if (descriptor.kind === 'custom') {
      assert.equal(callable.function.parameters.properties.input.type, 'string');
      assert.ok(callable.function.parameters.required.includes('input'));
    } else {
      assert.equal(callable.function.parameters.properties.key.type, 'string');
    }
  }
});

test('restores declared tool_search calls from Chat responses without confusing a colliding function', () => {
  const request = parseRequest('Res', { tools: [
    { type: 'function', name: 'tool_search', parameters: { type: 'object', properties: { topic: { type: 'string' } } } },
    { type: 'tool_search' },
  ] }, { direction: 'Res->Chat' });
  const search = request.tools.find((tool) => tool.kind === 'tool_search');
  const ordinary = request.tools.find((tool) => tool.name === 'tool_search' && tool.kind !== 'tool_search');
  assert.ok(search, 'the search proxy needs its own descriptor');
  assert.ok(ordinary, 'the ordinary function must keep its descriptor');
  const searchName = search.targetName || search.name;
  const ordinaryName = ordinary.targetName || ordinary.name;
  assert.notEqual(searchName, ordinaryName);
  const chat = serializeRequest('Chat', request, 'chat-model');
  assertToolSearchSchema(chat.tools.find((tool) => tool.function?.name === searchName));
  assert.ok(chat.tools.some((tool) => tool.function?.name === ordinaryName));
  const normalized = parseResponse('Chat', { id: 'chat-search', choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [
    { id: 'search-call', type: 'function', function: { name: searchName, arguments: '{"query":"lookup","limit":2}' } },
    { id: 'ordinary-call', type: 'function', function: { name: ordinaryName, arguments: '{"topic":"local catalogue"}' } },
  ] } }] }, request.tools);
  const response = serializeResponse('Res', normalized, 'req-search');
  assert.equal(response.output.length, 2);
  const searchCall = response.output.find((item) => item.call_id === 'search-call');
  assert.equal(searchCall.type, 'tool_search_call');
  assert.equal(searchCall.execution, 'client');
  assert.deepEqual(searchCall.arguments, { query: 'lookup', limit: 2 });
  const ordinaryCall = response.output.find((item) => item.call_id === 'ordinary-call');
  assert.equal(ordinaryCall.type, 'function_call');
  assert.equal(ordinaryCall.name, 'tool_search');
  assert.deepEqual(JSON.parse(ordinaryCall.arguments), { topic: 'local catalogue' });
});

test('completes fragmented Chat tool_search calls using descriptors without confusing a colliding function', () => {
  const request = parseRequest('Res', { tools: [
    { type: 'function', name: 'tool_search', parameters: { type: 'object', properties: { topic: { type: 'string' } } } },
    { type: 'tool_search' },
  ] }, { direction: 'Res->Chat' });
  const search = request.tools.find((tool) => tool.kind === 'tool_search');
  const ordinary = request.tools.find((tool) => tool.name === 'tool_search' && tool.kind !== 'tool_search');
  assert.ok(search, 'the search proxy needs its own descriptor');
  assert.ok(ordinary, 'the ordinary function must keep its descriptor');
  const searchName = search.targetName || search.name;
  const ordinaryName = ordinary.targetName || ordinary.name;
  assert.notEqual(searchName, ordinaryName);
  const chat = serializeRequest('Chat', request, 'chat-model');
  assertToolSearchSchema(chat.tools.find((tool) => tool.function?.name === searchName));
  assert.ok(chat.tools.some((tool) => tool.function?.name === ordinaryName));
  const state = { nextToolIndex: 0, toolIndexes: new Map(), toolContext: request.tools };
  const chunks = [
    { choices: [{ delta: { tool_calls: [
      { index: 0, id: 'stream-search', type: 'function', function: { name: searchName, arguments: '' } },
      { index: 1, id: 'stream-ordinary', type: 'function', function: { name: ordinaryName, arguments: '' } },
    ] } }] },
    { choices: [{ delta: { tool_calls: [
      { index: 0, function: { arguments: '{"query":"look' } },
      { index: 1, function: { arguments: '{"topic":' } },
    ] } }] },
    { choices: [{ delta: { tool_calls: [
      { index: 0, function: { arguments: 'up","limit":2}' } },
      { index: 1, function: { arguments: '"local catalogue"}' } },
    ] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    '[DONE]',
  ];
  const wire = chunks.map((chunk) => serializeStreamEvent('Res', parseStreamEvent('Chat', '', chunk, state), 'req-search-stream', state)).join('');
  const events = wire.split(/\r?\n\r?\n/).filter((frame) => frame.trim()).map((frame) => {
    const data = frame.split(/\r?\n/).find((line) => line.startsWith('data: '));
    assert.ok(data, 'each Responses frame must have a JSON payload');
    return JSON.parse(data.slice(6));
  });
  const completedSearchCalls = events.filter((event) => event.type === 'response.output_item.done' && event.item?.type === 'tool_search_call');
  assert.equal(completedSearchCalls.length, 1);
  const searchCall = completedSearchCalls[0].item;
  assert.equal(typeof searchCall.id, 'string');
  assert.ok(searchCall.id.length > 0);
  assert.equal(searchCall.call_id, 'stream-search');
  assert.equal(searchCall.execution, 'client');
  assert.deepEqual(searchCall.arguments, { query: 'lookup', limit: 2 });
  const ordinaryCalls = events.filter((event) => event.type === 'response.output_item.added' && event.item?.call_id === 'stream-ordinary');
  assert.equal(ordinaryCalls.length, 1);
  assert.equal(ordinaryCalls[0].item.type, 'function_call');
  assert.equal(ordinaryCalls[0].item.name, 'tool_search');
  const ordinaryArguments = events.filter((event) => event.type === 'response.function_call_arguments.delta' && event.output_index === ordinaryCalls[0].output_index).map((event) => event.delta).join('');
  assert.deepEqual(JSON.parse(ordinaryArguments), { topic: 'local catalogue' });
  assert.equal(events.filter((event) => event.type === 'response.completed').length, 1);
});

test('keeps a declared ordinary tool_search function as a Responses function call', () => {
  const request = parseRequest('Res', { tools: [{ type: 'function', name: 'tool_search', parameters: { type: 'object', properties: { topic: { type: 'string' } } } }] }, { direction: 'Res->Chat' });
  const chat = serializeRequest('Chat', request, 'chat-model');
  const normalized = parseResponse('Chat', { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [
    { id: 'ordinary-only', type: 'function', function: { name: chat.tools[0].function.name, arguments: '{"topic":"local catalogue"}' } },
  ] } }] }, request.tools);
  const response = serializeResponse('Res', normalized, 'req-ordinary');
  assert.equal(response.output[0].type, 'function_call');
  assert.equal(response.output[0].name, 'tool_search');
  assert.equal(response.output[0].call_id, 'ordinary-only');
  assert.deepEqual(JSON.parse(response.output[0].arguments), { topic: 'local catalogue' });
});

test('deduplicates loaded definitions by kind and namespace while keeping colliding calls reversible', () => {
  const members = [
    { type: 'function', name: 'run', parameters: { type: 'object' } },
    { type: 'custom', name: 'run', format: { type: 'text' } },
  ];
  const group = { type: 'namespace', name: 'mcp__loaded', tools: members };
  const request = parseRequest('Res', {
    tools: [{ type: 'tool_search' }, group],
    additional_tools: { tools: [group] },
    input: [
      { type: 'additional_tools', tools: [group, { type: 'tool_search' }] },
      { type: 'tool_search_call', call_id: 's', arguments: { query: 'run' } },
      { type: 'tool_search_output', call_id: 's', status: 'completed', tools: [group] },
      { type: 'function_call', namespace: 'mcp__loaded', name: 'run', call_id: 'f', arguments: { key: 'x' } },
      { type: 'custom_tool_call', namespace: 'mcp__loaded', name: 'run', call_id: 'c', input: 'raw input' },
    ],
  }, profile);
  const chat = serializeRequest('Chat', request, 'chat-model');
  assert.equal(chat.tools.length, 3);
  assert.equal(new Set(chat.tools.map((tool) => tool.function.name)).size, 3);
  const func = request.tools.find((tool) => tool.kind === 'function');
  const custom = request.tools.find((tool) => tool.kind === 'custom');
  assert.equal(chat.messages[2].tool_calls[0].function.name, func.targetName);
  assert.equal(chat.messages[2].tool_calls[0].function.arguments, '{"key":"x"}');
  assert.equal(chat.messages[3].tool_calls[0].function.name, custom.targetName);
  const restored = serializeResponse('Res', parseResponse('Chat', { choices: [{ message: { tool_calls: [
    { id: 'f', function: { name: func.targetName, arguments: '{}' } },
    { id: 'c', function: { name: custom.targetName, arguments: '{"input":"raw input"}' } },
  ] } }] }, request.tools), 'loaded');
  assert.equal(restored.output[0].type, 'function_call');
  assert.equal(restored.output[1].type, 'custom_tool_call');
  assert.equal(restored.output[1].input, 'raw input');
});

test('selects an ordinary tool_search function by kind even when the search proxy is declared first', () => {
  const request = parseRequest('Res', {
    tools: [{ type: 'tool_search' }, { type: 'function', name: 'tool_search' }],
    tool_choice: { type: 'function', name: 'tool_search' },
    input: [{ type: 'function_call', name: 'tool_search', call_id: 'ordinary', arguments: { topic: 'catalogue' } }],
  }, profile);
  const chat = serializeRequest('Chat', request, 'chat-model');
  const ordinary = request.tools.find((tool) => tool.kind !== 'tool_search');
  assert.deepEqual(chat.tool_choice, { type: 'function', function: { name: ordinary.targetName } });
  assert.equal(chat.messages[0].tool_calls[0].function.name, ordinary.targetName);
  assert.equal(chat.messages[0].tool_calls[0].function.arguments, '{"topic":"catalogue"}');
});

test('serializes structured function and custom results without losing object data', () => {
  const chat = serializeRequest('Chat', parseRequest('Res', { input: [
    { type: 'function_call_output', call_id: 'f', output: { found: ['one'] } },
    { type: 'custom_tool_call_output', call_id: 'c', output: { applied: true } },
    { type: 'function_call_output', call_id: 'array', output: [{ found: true }] },
    { type: 'custom_tool_call_output', call_id: 'text', output: [{ type: 'text', text: 'done' }] },
  ] }, profile), 'chat-model');
  assert.deepEqual(chat.messages, [
    { role: 'tool', tool_call_id: 'f', content: '{"found":["one"]}' },
    { role: 'tool', tool_call_id: 'c', content: '{"applied":true}' },
    { role: 'tool', tool_call_id: 'array', content: '[{"found":true}]' },
    { role: 'tool', tool_call_id: 'text', content: 'done' },
  ]);
});

test('preserves forced function choices for a sole custom proxy', () => {
  const request = parseRequest('Res', {
    tools: [{ type: 'custom', name: 'patch' }], tool_choice: { type: 'function', name: 'patch' },
  }, profile);
  const chat = serializeRequest('Chat', request, 'chat-model');
  assert.deepEqual(chat.tool_choice, { type: 'function', function: { name: chat.tools[0].function.name } });
});

test('collects top-level additional_tools and rejects malformed structural tool lists safely', () => {
  const chat = serializeRequest('Chat', parseRequest('Res', {
    additional_tools: { tools: [{ type: 'function', name: 'extra' }] }, input: 'hello',
  }, profile), 'chat-model');
  assert.ok(chat.tools, 'structural tools must reach the Chat request');
  assert.equal(chat.tools[0].function.name, 'extra');
  for (const body of [
    { tools: {} },
    { input: [{ type: 'additional_tools', tools: {} }] },
    { input: [{ type: 'tool_search_output', call_id: 's', tools: {} }] },
  ]) assert.throws(() => parseRequest('Res', body, profile), (error) => error.code === 'unsupported_feature' && error.field === 'tools');
});

test('restored search calls have completed object arguments and stable IDs for resumed history', () => {
  const request = parseRequest('Res', { tools: [{ type: 'tool_search' }] }, profile);
  const response = serializeResponse('Res', parseResponse('Chat', { choices: [{ message: { tool_calls: [
    { id: 'search-id', function: { name: 'tool_search', arguments: '{"query":"find"}' } },
  ] } }] }, request.tools), 'request-id');
  assert.equal(response.output[0].id, 'search-id');
  assert.equal(response.output[0].status, 'completed');
  const resumed = serializeRequest('Chat', parseRequest('Res', {
    tools: [{ type: 'tool_search' }], input: [response.output[0], { type: 'tool_search_output', call_id: 'search-id', status: 'completed', tools: [] }],
  }, profile), 'chat-model');
  assert.equal(resumed.messages[0].tool_calls[0].id, 'search-id');
  assert.deepEqual(JSON.parse(resumed.messages[0].tool_calls[0].function.arguments), { query: 'find' });
  assert.deepEqual(JSON.parse(resumed.messages[1].content), { status: 'completed', tools: [] });
});

test('maps a Responses tool_search tool choice to its distinct Chat proxy name', () => {
  const request = parseRequest('Res', {
    tools: [{ type: 'function', name: 'tool_search' }, { type: 'tool_search' }],
    tool_choice: { type: 'tool_search' },
  }, profile);
  const search = request.tools.find((tool) => tool.kind === 'tool_search');
  const chat = serializeRequest('Chat', request, 'chat-model');
  assert.ok(search);
  assert.deepEqual(chat.tool_choice, { type: 'function', function: { name: search.targetName } });
});

test('classifies malformed Chat search arguments as an upstream response error', () => {
  const request = parseRequest('Res', { tools: [{ type: 'tool_search' }] }, profile);
  const upstreamResponse = { choices: [{ message: { tool_calls: [
    { id: 's', function: { name: 'tool_search', arguments: '{"query":false}' } },
  ] } }] };
  assert.throws(() => serializeResponse('Res', parseResponse('Chat', upstreamResponse, request.tools), 'response'), (error) => {
    assert.equal(error.code, 'upstream_error');
    assert.equal(error.statusCode, 502);
    assert.equal(error.field, undefined);
    return true;
  });
  assert.throws(() => parseRequest('Res', {
    tools: [{ type: 'tool_search' }], input: [{ type: 'tool_search_call', call_id: 'bad', arguments: { query: false } }],
  }, profile), (error) => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.statusCode, 400);
    return true;
  });
});

test('rejects malformed search argument objects and server search execution without exposing values', () => {
  const request = parseRequest('Res', { tools: [{ type: 'tool_search' }] }, profile);
  for (const args of ['{private', '[]', 'null', '{}', '{"query":42}', '{"query":"private","limit":1.5}']) {
    assert.throws(() => serializeResponse('Res', parseResponse('Chat', { choices: [{ message: { tool_calls: [
      { id: 's', function: { name: 'tool_search', arguments: args } },
    ] } }] }, request.tools), 'invalid'), (error) => {
      assert.equal(error.code, 'upstream_error');
      assert.equal(error.statusCode, 502);
      assert.equal(JSON.stringify(error).includes('private'), false);
      return true;
    });
  }
  assert.throws(() => parseRequest('Res', { tools: [{ type: 'tool_search', execution: 'server' }] }, profile), (error) => error.code === 'unsupported_feature');
});

test('unsupported type diagnostics expose only actual unknown bounded type discriminators', () => {
  for (const [type, expected] of [
    ['web_search_preview', 'web_search_preview'], ['future_tool-2', 'future_tool-2'], ['x'.repeat(48), 'x'.repeat(48)],
    ['x'.repeat(49), undefined], ['private prompt/key', undefined], ['future_tool\n', undefined], [null, undefined], [23, undefined],
  ]) {
    assert.throws(() => parseRequest('Res', { tools: [{ type, name: 'private-name', parameters: { secret: 'private-schema' } }] }, profile), (error) => {
      assert.equal(error.toolType, expected);
      assert.equal(error.field, 'tools.type');
      assert.equal(/private-name|private-schema/.test(JSON.stringify(error)), false);
      return true;
    });
  }
  for (const tool of [{ type: 'function' }, { type: 'custom', name: 'c', format: { type: 'unknown' } }, { type: 'namespace', name: 'n' }]) {
    assert.throws(() => parseRequest('Res', { tools: [tool] }, profile), (error) => {
      assert.equal(error.toolType, undefined);
      return true;
    });
  }
  for (const [type, expected] of [['tool_search', undefined], ['future_nested', 'future_nested']]) {
    assert.throws(() => parseRequest('Res', { tools: [{ type: 'namespace', name: 'private-namespace', tools: [{ type }] }] }, profile), (error) => {
      assert.equal(error.toolType, expected);
      assert.equal(JSON.stringify(error).includes('private-namespace'), false);
      return true;
    });
  }
});

test('rejects server-executed built-ins with diagnostics that omit submitted tool data', () => {
  const secretToolName = 'private-search-backend';
  const secretArgument = 'sensitive query phrase';
  assert.throws(() => parseRequest('Res', { tools: [{ type: 'web_search_preview', name: secretToolName, execution: 'server', parameters: { secret: secretArgument } }] }, { direction: 'Res->Chat' }), (error) => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.field, 'tools.type');
    assert.equal(error.direction, 'Res->Chat');
    assert.equal(error.message, 'Unsupported protocol feature');
    assert.equal(JSON.stringify({ message: error.message, field: error.field, direction: error.direction }).includes(secretToolName), false);
    assert.equal(JSON.stringify({ message: error.message, field: error.field, direction: error.direction }).includes(secretArgument), false);
    return true;
  });
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
