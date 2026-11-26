import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRequest, serializeRequest, parseResponse, serializeResponse,
  parseStreamEvent, serializeStreamEvent,
} from '../../services/gateway/src/protocol-adapters.mjs';

const directions = ['Chat', 'Mes'];

test('Responses system and developer instructions reach Chat and Messages without empty reasoning messages', () => {
  const body = {
    instructions: 'base policy',
    input: [
      { role: 'system', content: 'system policy' },
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'developer policy' }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      { type: 'reasoning', id: 'rs_fixture', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'first answer' }] },
      { role: 'user', content: 'continue' },
    ],
  };
  for (const target of directions) {
    const payload = serializeRequest(target, parseRequest('Res', body, { direction: 'Res->' + target }), 'fixture');
    const instructions = target === 'Chat' ? payload.messages[0].content : payload.system;
    assert.equal(instructions, 'base policy\nsystem policy\ndeveloper policy');
    assert.deepEqual(payload.messages.slice(target === 'Chat' ? 1 : 0), [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'continue' },
    ]);
  }
  assert.deepEqual(body.input[3], { type: 'reasoning', id: 'rs_fixture', summary: [] });
});

test('Responses hosted search rejection identifies only the bounded type and gives a useful recovery action', () => {
  for (const target of directions) for (const type of ['web_search', 'web_search_preview']) {
    assert.throws(() => parseRequest('Res', { tools: [{ type, name: 'private-name', search_context_size: 'private-data' }] }, { direction: 'Res->' + target }), error => {
      assert.equal(error.code, 'unsupported_feature');
      assert.equal(error.statusCode, 400);
      assert.equal(error.field, 'tools.type');
      assert.equal(error.toolType, type);
      assert.match(error.message, /Responses/);
      assert.match(error.message, /Gateway/);
      assert.match(error.message, /web_search/);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private-name|private-data/);
      return true;
    });
  }
});

test('unrepresentable Responses history fails explicitly instead of becoming an empty user message', () => {
  for (const target of directions) for (const type of ['web_search_call', 'compaction', 'future_item']) {
    assert.throws(() => parseRequest('Res', { input: [{ type, id: 'private-id', encrypted_content: 'private-content' }] }, { direction: 'Res->' + target }), error => {
      assert.equal(error.code, 'unsupported_feature');
      assert.equal(error.statusCode, 400);
      assert.equal(error.field, 'input.type');
      assert.equal(error.itemType, type);
      assert.doesNotMatch(JSON.stringify(error), /private-id|private-content/);
      return true;
    });
  }
});

test('malformed Responses history is a safe request error rather than an internal exception', () => {
  for (const input of [{}, 7, [null], [false], [{ type: 'message', role: 'tool', content: 'orphan' }]]) {
    assert.throws(() => parseRequest('Res', { input }, { direction: 'Res->Mes' }), error => {
      assert.equal(error.code, 'unsupported_feature');
      assert.equal(error.statusCode, 400);
      assert.match(error.field, /^input/);
      return true;
    });
  }
});

test('mixed assistant text and tool calls survive all response conversion directions', () => {
  const sources = {
    Chat: { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: 'checking', tool_calls: [{ id: 'call-mixed', type: 'function', function: { name: 'lookup', arguments: '{"key":"x"}' } }] } }] },
    Mes: { stop_reason: 'tool_use', content: [{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 'call-mixed', name: 'lookup', input: { key: 'x' } }] },
    Res: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'checking' }] }, { type: 'function_call', call_id: 'call-mixed', name: 'lookup', arguments: '{"key":"x"}' }] },
  };
  for (const [source, body] of Object.entries(sources)) for (const target of ['Res', 'Mes', 'Chat'].filter(value => value !== source)) {
    const payload = serializeResponse(target, parseResponse(source, body), 'mixed');
    const message = target === 'Chat' ? payload.choices[0].message : undefined;
    const text = target === 'Chat' ? message.content : (target === 'Mes' ? payload.content : payload.output.flatMap(item => item.content || [])).filter(item => ['text', 'output_text'].includes(item.type)).map(item => item.text).join('');
    assert.equal(text, 'checking', source + '->' + target);
    assert.match(JSON.stringify(payload), /call-mixed/);
    assert.match(JSON.stringify(payload), /lookup/);
  }
});

test('Messages mixed text and tool history reaches Responses without dropping the text', () => {
  const payload = serializeRequest('Res', parseRequest('Mes', {
    messages: [{ role: 'assistant', content: [{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 'call-history', name: 'lookup', input: { key: 'x' } }] }],
  }), 'fixture');
  assert.deepEqual(payload.input, [
    { role: 'assistant', content: 'checking' },
    { type: 'function_call', call_id: 'call-history', name: 'lookup', arguments: '{"key":"x"}' },
  ]);
  const chat = parseRequest('Chat', { messages: [{ role: 'assistant', content: 'checking', tool_calls: [{ id: 'call-history', function: { name: 'lookup', arguments: '{"key":"x"}' } }] }] });
  assert.deepEqual(serializeRequest('Res', chat, 'fixture').input, payload.input);
});

test('Messages initial content and zero-argument tool calls survive a converted Responses stream', () => {
  const state = {};
  const events = [
    ['content_block_start', { index: 0, content_block: { type: 'text', text: 'initial text' } }],
    ['content_block_stop', { index: 0 }],
    ['content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call-zero', name: 'ping', input: {} } }],
    ['content_block_stop', { index: 1 }],
    ['message_delta', { delta: { stop_reason: 'tool_use' } }],
    ['message_stop', {}],
  ];
  const wire = events.map(([name, payload]) => serializeStreamEvent('Res', parseStreamEvent('Mes', name, payload, state), 'initial', state)).join('');
  const frames = wire.split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.split('\ndata: ')[1]));
  const complete = frames.find(frame => frame.type === 'response.completed');
  assert.equal(complete.response.output[0].content[0].text, 'initial text');
  assert.equal(complete.response.output[1].type, 'function_call');
  assert.equal(complete.response.output[1].arguments, '{}');
});

function ssePayloads(wire) {
  return wire.split(/\r?\n\r?\n/).filter(Boolean).map(frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    return data === '[DONE]' ? data : JSON.parse(data);
  });
}

test('converted Messages streams have a complete message and content block lifecycle', () => {
  for (const source of ['Chat', 'Res']) {
    const state = { model: 'fixture' };
    const fixtures = source === 'Chat' ? [
      ['', { choices: [{ delta: { content: 'checking' } }] }],
      ['', { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-lifecycle', function: { name: 'lookup', arguments: '{"key":' } }] } }] }],
      ['', { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }, finish_reason: 'tool_calls' }] }],
    ] : [
      ['response.output_text.delta', { output_index: 0, delta: 'checking' }],
      ['response.output_item.added', { output_index: 1, item: { type: 'function_call', call_id: 'call-lifecycle', name: 'lookup' } }],
      ['response.function_call_arguments.delta', { output_index: 1, delta: '{"key":"x"}' }],
      ['response.completed', { response: { status: 'completed' } }],
    ];
    const wire = fixtures.map(([name, payload]) => serializeStreamEvent('Mes', parseStreamEvent(source, name, payload, state), 'lifecycle', state)).join('');
    const frames = ssePayloads(wire);
    assert.equal(frames[0].type, 'message_start', source + '->Mes message_start');
    assert.equal(frames[0].message.role, 'assistant');
    assert.equal(frames[0].message.model, 'fixture');
    const starts = frames.filter(frame => frame.type === 'content_block_start');
    assert.deepEqual(starts.map(frame => [frame.index, frame.content_block.type]), [[0, 'text'], [1, 'tool_use']]);
    const text = frames.filter(frame => frame.delta?.type === 'text_delta').map(frame => frame.delta.text).join('');
    assert.equal(text, 'checking');
    assert.deepEqual(frames.filter(frame => frame.type === 'content_block_stop').map(frame => frame.index), [0, 1]);
    assert.equal(frames.at(-2).type, 'message_delta');
    assert.equal(frames.at(-2).delta.stop_reason, 'tool_use');
    assert.equal(frames.at(-1).type, 'message_stop');
    const roundtrip = { model: 'fixture' };
    const responseWire = frames.map(frame => serializeStreamEvent('Res', parseStreamEvent('Mes', frame.type, frame, roundtrip), 'roundtrip', roundtrip)).join('');
    const completed = ssePayloads(responseWire).find(frame => frame.type === 'response.completed');
    assert.equal(completed.response.output[0].content[0].text, 'checking');
    assert.equal(completed.response.output[1].arguments, '{"key":"x"}');
  }
});

test('Responses reasoning stream text is never exposed as answer text', () => {
  for (const type of ['response.reasoning_text.delta', 'response.reasoning_summary_text.delta']) {
    assert.equal(parseStreamEvent('Res', type, { delta: 'private thought' }).type, 'ignore');
  }
});

test('incomplete and failed Responses streams never claim an ordinary successful chat completion', () => {
  for (const target of ['Chat', 'Mes']) {
    const state = {};
    const wire = serializeStreamEvent(target, parseStreamEvent('Res', 'response.incomplete', { response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } }, state), 'incomplete', state);
    const terminal = ssePayloads(wire).find(frame => target === 'Chat' ? frame.choices?.[0]?.finish_reason : frame.type === 'message_delta');
    assert.equal(target === 'Chat' ? terminal?.choices[0].finish_reason : terminal?.delta.stop_reason, target === 'Chat' ? 'length' : 'max_tokens');
  }
  for (const type of ['response.failed', 'error']) {
    assert.throws(() => parseStreamEvent('Res', type, { error: { message: 'private provider data' } }), error => {
      assert.equal(error.code, 'upstream_error');
      assert.equal(error.statusCode, 502);
      assert.doesNotMatch(error.message, /private provider data/);
      return true;
    });
  }
});

test('opaque reasoning history resumes through Chat and Messages without exposing its payload', () => {
  for (const target of directions) {
    const request = parseRequest('Res', { input: [
      { role: 'user', content: 'continue' },
      { type: 'reasoning', summary: [], encrypted_content: 'private-encrypted-history' },
      { role: 'assistant', content: 'answer' },
    ] }, { direction: 'Res->' + target });
    assert.deepEqual(request.compatibilityWarnings, [{ code: 'opaque_reasoning_ignored', count: 1 }]);
    assert.deepEqual(serializeRequest(target, request, 'fixture').messages, [
      { role: 'user', content: 'continue' }, { role: 'assistant', content: 'answer' },
    ]);
    assert.doesNotMatch(JSON.stringify(request), /private-encrypted-history/);
  }
});

const toolCases = [
  { name: 'function', definition: { type: 'function', name: 'lookup', parameters: { type: 'object', properties: { key: { type: 'string' } } } }, call: { type: 'function_call', name: 'lookup', call_id: 'call-fn', arguments: '{"key":"x"}' }, wantName: 'lookup', arguments: '{"key":"x"}', resultType: 'function_call_output' },
  { name: 'namespace function', definition: { type: 'namespace', name: 'fixture_ns', tools: [{ type: 'function', name: 'lookup', parameters: { type: 'object' } }] }, call: { type: 'function_call', namespace: 'fixture_ns', name: 'lookup', call_id: 'call-ns', arguments: '{"key":"x"}' }, wantName: 'fixture_ns__lookup', arguments: '{"key":"x"}', resultType: 'function_call_output' },
  { name: 'custom', definition: { type: 'custom', name: 'patch', format: { type: 'text' } }, call: { type: 'custom_tool_call', name: 'patch', call_id: 'call-custom', input: 'raw\npatch' }, wantName: 'patch', arguments: '{"input":"raw\\npatch"}', resultType: 'custom_tool_call_output' },
  { name: 'namespace custom', definition: { type: 'namespace', name: 'fixture_ns', tools: [{ type: 'custom', name: 'patch', format: { type: 'grammar', syntax: 'lark', definition: 'start: WORD' } }] }, call: { type: 'custom_tool_call', namespace: 'fixture_ns', name: 'patch', call_id: 'call-ns-custom', input: 'raw\npatch' }, wantName: 'fixture_ns__patch', arguments: '{"input":"raw\\npatch"}', resultType: 'custom_tool_call_output' },
  { name: 'client tool search', definition: { type: 'tool_search', execution: 'client' }, call: { type: 'tool_search_call', call_id: 'call-search', execution: 'client', arguments: { query: 'lookup', limit: 2 } }, wantName: 'tool_search', arguments: '{"query":"lookup","limit":2}', resultType: 'tool_search_output' },
];

for (const target of directions) for (const fixture of toolCases) {
  test('Responses ' + fixture.name + ' survives ' + target + ' definition, call, streamed completion and result history', () => {
    const request = parseRequest('Res', { tools: [fixture.definition], input: 'check' }, { direction: 'Res->' + target });
    const forwarded = serializeRequest(target, request, 'fixture');
    assert.equal(target === 'Chat' ? forwarded.tools[0].function.name : forwarded.tools[0].name, fixture.wantName);
    const upstream = target === 'Chat'
      ? { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: fixture.call.call_id, function: { name: fixture.wantName, arguments: fixture.arguments } }] } }] }
      : { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: fixture.call.call_id, name: fixture.wantName, input: JSON.parse(fixture.arguments) }] };
    const response = serializeResponse('Res', parseResponse(target, upstream, request.tools), 'local-tool');
    const call = response.output[0];
    assert.equal(call.type, fixture.call.type);
    assert.equal(call.call_id, fixture.call.call_id);
    if (fixture.call.name) assert.equal(call.name, fixture.call.name);
    if (fixture.call.namespace) assert.equal(call.namespace, fixture.call.namespace);
    if (call.type === 'custom_tool_call') assert.equal(call.input, 'raw\npatch');
    if (call.type === 'tool_search_call') assert.deepEqual(call.arguments, { query: 'lookup', limit: 2 });

    const state = { toolContext: request.tools };
    const half = Math.floor(fixture.arguments.length / 2);
    const stream = target === 'Chat' ? [
      ['', { choices: [{ delta: { tool_calls: [{ index: 0, id: fixture.call.call_id, function: { name: fixture.wantName, arguments: fixture.arguments.slice(0, half) } }] } }] }],
      ['', { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: fixture.arguments.slice(half) } }] }, finish_reason: 'tool_calls' }] }],
    ] : [
      ['content_block_start', { index: 0, content_block: { type: 'tool_use', id: fixture.call.call_id, name: fixture.wantName, input: {} } }],
      ['content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: fixture.arguments.slice(0, half) } }],
      ['content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: fixture.arguments.slice(half) } }],
      ['content_block_stop', { index: 0 }],
      ['message_delta', { delta: { stop_reason: 'tool_use' } }],
      ['message_stop', {}],
    ];
    const wire = stream.map(([name, payload]) => serializeStreamEvent('Res', parseStreamEvent(target, name, payload, state), 'local-tool', state)).join('');
    const frames = ssePayloads(wire);
    assert.equal(frames.filter(frame => frame.type === 'response.completed').length, 1);
    const completed = frames.at(-1);
    assert.equal(completed.type, 'response.completed');
    assert.deepEqual(completed.response.output.map(({ id, status, ...item }) => item), response.output.map(({ id, status, ...item }) => item));

    const result = fixture.resultType === 'tool_search_output'
      ? { type: fixture.resultType, call_id: fixture.call.call_id, execution: 'client', status: 'completed', tools: [{ type: 'function', name: 'discovered', parameters: { type: 'object' } }] }
      : { type: fixture.resultType, call_id: fixture.call.call_id, output: { ok: true } };
    const resumed = serializeRequest(target, parseRequest('Res', { tools: [fixture.definition], input: [
      { role: 'user', content: 'check' }, { type: 'reasoning', summary: [] },
      ...response.output, result, { role: 'user', content: 'continue' },
    ] }, { direction: 'Res->' + target }), 'fixture');
    const calls = target === 'Chat' ? resumed.messages[1].tool_calls : resumed.messages[1].content.filter(block => block.type === 'tool_use');
    assert.equal(calls.length, 1);
    assert.equal(target === 'Chat' ? calls[0].function.name : calls[0].name, fixture.wantName);
    assert.equal(target === 'Chat' ? resumed.messages[2].tool_call_id : resumed.messages[2].content[0].tool_use_id, fixture.call.call_id);
    assert.equal(resumed.messages.at(-1).content, 'continue');
    if (fixture.resultType === 'tool_search_output') assert.equal(resumed.tools.length, 2);
    else assert.equal(target === 'Chat' ? resumed.messages[2].content : resumed.messages[2].content[0].content, '{"ok":true}');
  });
}

test('ordinary text streams complete once with the expected text in every cross-protocol direction', () => {
  const fixtures = {
    Chat: [['', { choices: [{ delta: { content: 'hello ' } }] }], ['', { choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }] }], ['', '[DONE]']],
    Mes: [['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }], ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'hello ' } }], ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'world' } }], ['message_delta', { delta: { stop_reason: 'end_turn' } }], ['message_stop', {}]],
    Res: [['response.output_text.delta', { delta: 'hello ' }], ['response.output_text.delta', { delta: 'world' }], ['response.completed', { response: { status: 'completed' } }]],
  };
  for (const [source, stream] of Object.entries(fixtures)) for (const target of ['Chat', 'Mes', 'Res'].filter(value => value !== source)) {
    const state = {};
    const wire = stream.map(([name, payload]) => serializeStreamEvent(target, parseStreamEvent(source, name, payload, state), 'ordinary', state)).join('');
    const frames = ssePayloads(wire);
    const text = frames.filter(frame => frame !== '[DONE]').map(frame => target === 'Chat' ? frame.choices?.[0]?.delta.content || '' : target === 'Mes' ? frame.delta?.type === 'text_delta' ? frame.delta.text : '' : frame.type === 'response.output_text.delta' ? frame.delta : '').join('');
    assert.equal(text, 'hello world', source + '->' + target);
    assert.equal(frames.filter(frame => target === 'Chat' ? frame === '[DONE]' : target === 'Mes' ? frame.type === 'message_stop' : frame.type === 'response.completed').length, 1);
    if (target === 'Chat') assert.equal(frames.at(-2).choices[0].finish_reason, 'stop');
    if (target === 'Mes') assert.equal(frames.at(-2).delta.stop_reason, 'end_turn');
  }
});

test('token limits remain incomplete in every non-streaming conversion direction', () => {
  const fixtures = {
    Chat: { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] },
    Mes: { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] },
    Res: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'partial' }] }] },
  };
  for (const [source, body] of Object.entries(fixtures)) for (const target of ['Chat', 'Mes', 'Res'].filter(value => value !== source)) {
    const payload = serializeResponse(target, parseResponse(source, body), 'limited');
    assert.equal(target === 'Chat' ? payload.choices[0].finish_reason : target === 'Mes' ? payload.stop_reason : payload.status, target === 'Chat' ? 'length' : target === 'Mes' ? 'max_tokens' : 'incomplete', source + '->' + target);
  }
});

test('unknown Responses incomplete reasons are explicit upstream errors rather than successful completions', () => {
  for (const reason of [undefined, 'future_reason']) {
    for (const response of [
      () => parseResponse('Res', { status: 'incomplete', incomplete_details: { reason }, output: [] }),
      () => parseStreamEvent('Res', 'response.incomplete', { response: { status: 'incomplete', incomplete_details: { reason } } }),
    ]) assert.throws(response, error => error.code === 'upstream_error' && error.statusCode === 502);
  }
});

test('public Responses reasoning summaries remain metadata, allow resumed tools and round-trip to Responses', () => {
  const reasoning = { type: 'reasoning', id: 'rs_public', summary: [{ type: 'summary_text', text: 'public summary' }], status: 'completed' };
  const body = { instructions: 'base policy', tools: [{ type: 'function', name: 'ping' }], input: [
    { role: 'developer', content: 'developer policy' }, { role: 'user', content: 'check' },
    reasoning, { type: 'function_call', call_id: 'call-public', name: 'ping', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-public', output: 'pong' },
  ] };
  const request = parseRequest('Res', body, { direction: 'Res->Mes' });
  assert.deepEqual(request.reasoningMetadata, [{ messageIndex: 1, item: reasoning }]);
  for (const target of directions) {
    const payload = serializeRequest(target, request, 'fixture');
    assert.doesNotMatch(JSON.stringify(payload), /public summary|reasoning_content|thinking|signature/);
    assert.match(JSON.stringify(payload), /call-public/);
    assert.match(JSON.stringify(payload), /pong/);
  }
  const restored = serializeRequest('Res', request, 'fixture');
  assert.deepEqual(restored.input[1], reasoning);
  assert.equal(restored.input[2].type, 'function_call');
  assert.equal(restored.input[3].type, 'function_call_output');
  assert.deepEqual(body.input[2], reasoning);
});

test('malformed public reasoning never becomes a successful empty conversation', () => {
  for (const reasoning of [
    { type: 'reasoning', summary: {} },
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 7 }] },
    { type: 'reasoning', summary: [{ type: 'future_reason', text: 'private' }] },
  ]) assert.throws(() => parseRequest('Res', { input: [reasoning] }), error => error.code === 'unsupported_feature' && error.field === 'input.reasoning.summary');
});

test('public reasoning between assistant text and tool calls keeps its Responses history position', () => {
  const reasoning = { type: 'reasoning', summary: [{ type: 'summary_text', text: 'public summary' }] };
  const request = parseRequest('Res', { tools: [{ type: 'function', name: 'ping' }], input: [
    { role: 'user', content: 'check' }, { role: 'assistant', content: 'checking' }, reasoning,
    { type: 'function_call', call_id: 'call-position', name: 'ping', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-position', output: 'pong' },
  ] });
  const payload = serializeRequest('Res', request, 'fixture');
  assert.deepEqual(payload.input[2], reasoning);
  assert.equal(payload.input[3].type, 'function_call');
});

test('server-executed tool search output is never presented as a local tool result', () => {
  assert.throws(() => parseRequest('Res', { tools: [{ type: 'tool_search', execution: 'client' }], input: [
    { type: 'tool_search_output', execution: 'server', call_id: 'search-server', tools: [] },
  ] }, { direction: 'Res->Mes' }), error => error.code === 'unsupported_feature' && error.field === 'input.execution');
});

for (const source of ['Chat', 'Mes']) {
  test(source + ' token-limit stream before any output returns an empty incomplete Responses envelope', () => {
    const state = { model: 'fixture' };
    const stream = source === 'Chat'
      ? [['', { choices: [{ delta: {}, finish_reason: 'length' }] }], ['', '[DONE]']]
      : [['message_delta', { delta: { stop_reason: 'max_tokens' } }], ['message_stop', {}]];
    const wire = stream.map(([name, payload]) => serializeStreamEvent('Res', parseStreamEvent(source, name, payload, state), 'empty-limit', state)).join('');
    const frames = ssePayloads(wire);
    assert.deepEqual(frames.map(frame => frame.type), ['response.created', 'response.in_progress', 'response.incomplete']);
    assert.deepEqual(frames.at(-1).response.output, []);
    assert.equal(frames.at(-1).response.status, 'incomplete');
    assert.deepEqual(frames.at(-1).response.incomplete_details, { reason: 'max_output_tokens' });
  });
}

test('empty converted success or unqualified terminal still fails without fabricating output', () => {
  for (const finishReason of [undefined, 'stop', 'end_turn', 'completed', 'future_reason']) {
    assert.throws(() => serializeStreamEvent('Res', { type: 'done', ...(finishReason ? { finishReason } : {}) }, 'empty-success', {}), error => error.code === 'upstream_error' && error.statusCode === 502);
  }
  assert.throws(() => serializeStreamEvent('Res', { type: 'done', finishReason: 'length' }, 'malformed-tool', {
    responseCalls: new Map([[0, { arguments: '{}' }]]), responseItems: [],
  }), error => error.code === 'upstream_error' && error.statusCode === 502);
});

test('malformed or incomplete Responses function history fails safely before a callable request is emitted', () => {
  for (const target of directions) for (const fixture of [
    { call: { arguments: '{"key":' }, field: 'input.function_call.arguments' },
    { call: { arguments: 'null' }, field: 'input.function_call.arguments' },
    { call: { arguments: '[]' }, field: 'input.function_call.arguments' },
    { call: { arguments: '{}', status: 'incomplete' }, field: 'input.function_call.status' },
  ]) {
    assert.throws(() => serializeRequest(target, parseRequest('Res', {
      tools: [{ type: 'function', name: 'lookup' }], input: [{ type: 'function_call', call_id: 'private-call', name: 'lookup', ...fixture.call }],
    }, { direction: 'Res->' + target }), 'fixture'), error => {
      assert.equal(error.code, 'unsupported_feature');
      assert.equal(error.statusCode, 400);
      assert.equal(error.field, fixture.field);
      assert.equal(error.direction, 'Res->' + target);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private-call|lookup|key/);
      return true;
    });
  }
});

for (const source of ['Chat', 'Mes']) for (const kind of ['custom', 'tool_search']) {
  test(source + ' truncated ' + kind + ' proxy never emits an executable Responses call', () => {
    const request = parseRequest('Res', { tools: [{ type: kind, ...(kind === 'custom' ? { name: 'patch' } : { execution: 'client' }) }] });
    const state = { toolContext: request.tools };
    const name = kind === 'custom' ? 'patch' : 'tool_search';
    const args = kind === 'custom' ? '{"input":"partial' : '{"query":"partial';
    const stream = source === 'Chat' ? [
      ['', { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-truncated', function: { name, arguments: args } }] } }] }],
      ['', { choices: [{ delta: {}, finish_reason: 'length' }] }],
    ] : [
      ['content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call-truncated', name, input: {} } }],
      ['content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: args } }],
      ['message_delta', { delta: { stop_reason: 'max_tokens' } }], ['message_stop', {}],
    ];
    const wire = stream.map(([name, payload]) => serializeStreamEvent('Res', parseStreamEvent(source, name, payload, state), 'truncated', state)).join('');
    const frames = ssePayloads(wire);
    assert.equal(frames.at(-1).type, 'response.incomplete');
    assert.deepEqual(frames.at(-1).response.output, []);
    assert.deepEqual(frames.at(-1).response.incomplete_details, { reason: 'max_output_tokens' });
    assert.equal(frames.some(frame => frame.type === 'response.output_item.done' || frame.type === 'response.custom_tool_call_input.done'), false);
    assert.doesNotMatch(wire, /partial/);
  });
}

test('completed custom proxies reject malformed wrappers instead of treating JSON as raw custom input', () => {
  const request = parseRequest('Res', { tools: [{ type: 'custom', name: 'patch' }] });
  for (const args of ['{"input":"private', 'null', '[]', '{}', '{"input":7}']) {
    const safeError = error => {
      assert.equal(error.code, 'upstream_error');
      assert.equal(error.statusCode, 502);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private/);
      return true;
    };
    assert.throws(() => parseResponse('Chat', { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'c', function: { name: 'patch', arguments: args } }] } }] }, request.tools), safeError);
    const state = { toolContext: request.tools };
    serializeStreamEvent('Res', parseStreamEvent('Chat', '', { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'patch', arguments: args } }] } }] }, state), 'bad-custom', state);
    assert.throws(() => serializeStreamEvent('Res', { type: 'done', finishReason: 'tool_calls' }, 'bad-custom', state), safeError);
  }
});

test('non-streaming incomplete custom and search proxies retain incompleteness without executable calls', () => {
  for (const source of ['Chat', 'Mes']) for (const kind of ['custom', 'tool_search']) {
    const request = parseRequest('Res', { tools: [{ type: kind, ...(kind === 'custom' ? { name: 'patch' } : { execution: 'client' }) }] });
    const name = kind === 'custom' ? 'patch' : 'tool_search';
    const body = source === 'Chat'
      ? { choices: [{ finish_reason: 'length', message: { tool_calls: [{ id: 'partial-call', function: { name, arguments: '{"input":"partial' } }] } }] }
      : { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'partial-call', name, input: { input: 'partial' } }] };
    const payload = serializeResponse('Res', parseResponse(source, body, request.tools), 'partial');
    assert.equal(payload.status, 'incomplete');
    assert.deepEqual(payload.output, []);
    assert.deepEqual(payload.incomplete_details, { reason: 'max_output_tokens' });
  }
});

test('Responses custom tool choice selects only its matching custom proxy including colliding names', () => {
  for (const target of directions) for (const namespace of [undefined, 'fixture_ns']) {
    const members = [{ type: 'function', name: 'patch' }, { type: 'custom', name: 'patch' }];
    const request = parseRequest('Res', {
      tools: namespace ? [{ type: 'namespace', name: namespace, tools: members }] : members,
      tool_choice: { type: 'custom', name: 'patch', ...(namespace ? { namespace } : {}) },
    }, { direction: 'Res->' + target });
    const custom = request.tools.find(tool => tool.kind === 'custom');
    const fn = request.tools.find(tool => tool.kind !== 'custom');
    const payload = serializeRequest(target, request, 'fixture');
    assert.equal(target === 'Chat' ? payload.tool_choice.function.name : payload.tool_choice.name, custom.targetName);
    assert.notEqual(custom.targetName, fn.targetName || fn.name);
  }
  for (const tools of [[{ type: 'function', name: 'patch' }], [{ type: 'custom', name: 'other' }], []]) {
    assert.throws(() => parseRequest('Res', { tools, tool_choice: { type: 'custom', name: 'patch' } }, { direction: 'Res->Mes' }), error => error.code === 'unsupported_feature' && error.field === 'tool_choice');
  }
});

test('Responses function choice prefers its declared function over a same-named custom proxy', () => {
  for (const target of directions) for (const namespace of [undefined, 'fixture_ns']) {
    const members = [{ type: 'custom', name: 'patch' }, { type: 'function', name: 'patch' }];
    const request = parseRequest('Res', {
      tools: namespace ? [{ type: 'namespace', name: namespace, tools: members }] : members,
      tool_choice: { type: 'function', name: 'patch', ...(namespace ? { namespace } : {}) },
    }, { direction: 'Res->' + target });
    const fn = request.tools.find(tool => tool.kind !== 'custom');
    const payload = serializeRequest(target, request, 'fixture');
    assert.equal(target === 'Chat' ? payload.tool_choice.function.name : payload.tool_choice.name, fn.targetName || fn.name);
  }
});
