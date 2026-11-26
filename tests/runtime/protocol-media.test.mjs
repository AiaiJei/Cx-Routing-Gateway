import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, serializeRequest } from '../../services/gateway/src/protocol-adapters.mjs';

const url = 'https://example.invalid/picture.png';
const dataUrl = 'data:image/png;base64,aGVsbG8=';
const blocks = {
  Res: [{ type: 'input_text', text: 'before' }, { type: 'input_image', image_url: url }, { type: 'input_text', text: 'middle' }, { type: 'input_image', image_url: dataUrl }, { type: 'input_text', text: 'after' }],
  Chat: [{ type: 'text', text: 'before' }, { type: 'image_url', image_url: { url } }, { type: 'text', text: 'middle' }, { type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: 'after' }],
  Mes: [{ type: 'text', text: 'before' }, { type: 'image', source: { type: 'url', url } }, { type: 'text', text: 'middle' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } }, { type: 'text', text: 'after' }],
};
const bodyFor = (protocol, content) => protocol === 'Res' ? { input: [{ role: 'user', content }] } : { messages: [{ role: 'user', content }] };
const contentFor = (protocol, payload) => protocol === 'Res' ? payload.input[0].content : payload.messages[0].content;

for (const source of ['Res', 'Chat', 'Mes']) for (const target of ['Res', 'Chat', 'Mes']) {
  test(source + '->' + target + ' retains ordered text, HTTPS and base64 image blocks without fetching', () => {
    const body = bodyFor(source, blocks[source]);
    const original = structuredClone(body);
    const request = parseRequest(source, body, { direction: source + '->' + target });
    assert.deepEqual(contentFor(target, serializeRequest(target, request, 'fixture')), blocks[target]);
    assert.deepEqual(body, original);
  });
}

test('image detail survives Responses and Chat conversion without becoming image data', () => {
  const request = parseRequest('Res', bodyFor('Res', [{ type: 'input_image', image_url: url, detail: 'high' }]), { direction: 'Res->Chat' });
  const chat = serializeRequest('Chat', request, 'fixture');
  assert.deepEqual(chat.messages[0].content, [{ type: 'image_url', image_url: { url, detail: 'high' } }]);
  const restored = serializeRequest('Res', parseRequest('Chat', chat), 'fixture');
  assert.deepEqual(restored.input[0].content, [{ type: 'input_image', image_url: url, detail: 'high' }]);
});

test('mixed Messages content preserves media and tool order and IDs', () => {
  const request = parseRequest('Mes', { messages: [{ role: 'assistant', content: [
    { type: 'text', text: 'first' }, { type: 'tool_use', id: 'call-1', name: 'ping', input: {} },
    { type: 'text', text: 'second' }, { type: 'image', source: { type: 'url', url } },
  ] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: [
    { type: 'text', text: 'result' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
  ] }] }] }, { direction: 'Mes->Res' });
  assert.deepEqual(serializeRequest('Res', request, 'fixture').input, [
    { role: 'assistant', content: 'first' },
    { type: 'function_call', call_id: 'call-1', name: 'ping', arguments: '{}' },
    { role: 'assistant', content: [{ type: 'output_text', text: 'second' }, { type: 'input_image', image_url: url }] },
    { type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_text', text: 'result' }, { type: 'input_image', image_url: dataUrl }] },
  ]);
});

test('Messages mixed assistant blocks become one Chat assistant message immediately followed by tool results', () => {
  const body = { messages: [{ role: 'assistant', content: [
    { type: 'text', text: 'before' }, { type: 'tool_use', id: 'call-1', name: 'ping', input: {} },
    { type: 'text', text: 'after' }, { type: 'tool_use', id: 'call-2', name: 'pong', input: { value: 2 } },
    { type: 'text', text: 'last' },
  ] }, { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call-1', content: 'one' },
    { type: 'tool_result', tool_use_id: 'call-2', content: 'two' },
  ] }] };
  const payload = serializeRequest('Chat', parseRequest('Mes', body, { direction: 'Mes->Chat' }), 'fixture');
  assert.deepEqual(payload.messages, [{
    role: 'assistant', content: 'beforeafterlast', tool_calls: [
      { id: 'call-1', type: 'function', function: { name: 'ping', arguments: '{}' } },
      { id: 'call-2', type: 'function', function: { name: 'pong', arguments: '{"value":2}' } },
    ],
  }, { role: 'tool', tool_call_id: 'call-1', content: 'one' }, { role: 'tool', tool_call_id: 'call-2', content: 'two' }]);
});

test('reasoning between parallel Responses calls does not split the Chat assistant tool turn', () => {
  for (const reasoning of [
    { type: 'reasoning', summary: [], encrypted_content: 'private-cipher' },
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'public metadata' }] },
  ]) {
    const request = parseRequest('Res', { input: [
      { role: 'user', content: 'check' },
      { type: 'function_call', call_id: 'call-1', name: 'ping', arguments: '{}' }, reasoning,
      { type: 'function_call', call_id: 'call-2', name: 'pong', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call-1', output: 'one' },
      { type: 'function_call_output', call_id: 'call-2', output: 'two' },
    ] }, { direction: 'Res->Chat' });
    const payload = serializeRequest('Chat', request, 'fixture');
    assert.deepEqual(payload.messages.map(item => item.role), ['user', 'assistant', 'tool', 'tool']);
    assert.deepEqual(payload.messages[1].tool_calls.map(call => call.id), ['call-1', 'call-2']);
    assert.deepEqual(payload.messages.slice(2).map(item => item.tool_call_id), ['call-1', 'call-2']);
    assert.doesNotMatch(JSON.stringify(payload), /private-cipher|public metadata/);
  }
});

test('Chat target rejects non-user image content without changing roles or exposing image data', () => {
  const cases = [
    ['Res', { input: [{ role: 'assistant', content: [{ type: 'input_image', image_url: url }] }] }, 'input.content'],
    ['Mes', { messages: [{ role: 'assistant', content: [{ type: 'image', source: { type: 'url', url } }] }] }, 'messages.content'],
    ['Res', { input: [{ type: 'function_call_output', call_id: 'private-id', output: [{ type: 'input_image', image_url: url }] }] }, 'input.output'],
  ];
  for (const [source, body, field] of cases) assert.throws(() => parseRequest(source, body, { direction: source + '->Chat' }), error => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.field, field);
    assert.equal(error.direction, source + '->Chat');
    assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /example.invalid|picture|private-id/);
    return true;
  });
});

test('Messages image-detail degradation reports only counts and keeps opaque-history warnings and all images', () => {
  const request = parseRequest('Res', { input: [
    { role: 'user', content: [{ type: 'input_image', image_url: url, detail: 'high' }, { type: 'input_image', image_url: dataUrl, detail: 'auto' }] },
    { type: 'reasoning', summary: [], encrypted_content: 'private-cipher' },
    { type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_image', image_url: url, detail: 'low' }] },
    { type: 'custom_tool_call_output', call_id: 'call-2', output: [{ type: 'input_image', image_url: dataUrl, detail: 'high' }] },
  ] }, { direction: 'Res->Mes' });
  assert.deepEqual(request.compatibilityWarnings, [
    { code: 'opaque_reasoning_ignored', count: 1 }, { code: 'image_detail_omitted', count: 3 },
  ]);
  const payload = serializeRequest('Mes', request, 'fixture');
  assert.deepEqual(payload.messages[0].content, [
    { type: 'image', source: { type: 'url', url } }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
  ]);
  assert.equal(payload.messages[1].content[0].content[0].type, 'image');
  assert.equal(payload.messages[1].content[1].content[0].type, 'image');
  assert.doesNotMatch(JSON.stringify(payload), /detail|private-cipher/);
});

test('Chat image detail high and low produce a Messages warning while auto and missing detail do not', () => {
  for (const detail of ['high', 'low', 'auto', undefined]) {
    const request = parseRequest('Chat', bodyFor('Chat', [{ type: 'image_url', image_url: { url, ...(detail === undefined ? {} : { detail }) } }]), { direction: 'Chat->Mes' });
    assert.deepEqual(request.compatibilityWarnings, ['high', 'low'].includes(detail) ? [{ code: 'image_detail_omitted', count: 1 }] : undefined);
    assert.deepEqual(serializeRequest('Mes', request, 'fixture').messages[0].content, [{ type: 'image', source: { type: 'url', url } }]);
  }
});

test('Responses image tool results reach Messages as image blocks and fail explicitly for Chat text-only tool results', () => {
  const body = { input: [{ type: 'function_call_output', call_id: 'call-image', output: [
    { type: 'input_text', text: 'result' }, { type: 'input_image', image_url: url },
  ] }] };
  const request = parseRequest('Res', body, { direction: 'Res->Mes' });
  assert.deepEqual(serializeRequest('Mes', request, 'fixture').messages, [{ role: 'user', content: [{
    type: 'tool_result', tool_use_id: 'call-image', content: [{ type: 'text', text: 'result' }, { type: 'image', source: { type: 'url', url } }],
  }] }]);
  assert.throws(() => serializeRequest('Chat', request, 'fixture'), error => error.code === 'unsupported_feature' && error.field === 'messages.tool.content');
});

test('empty Responses tool content retains the existing empty-text result contract', () => {
  const request = parseRequest('Res', { input: [{ type: 'function_call_output', call_id: 'empty-call', output: [] }] });
  assert.deepEqual(serializeRequest('Chat', request, 'fixture').messages, [{ role: 'tool', tool_call_id: 'empty-call', content: '' }]);
});

test('unsupported image sources, malformed base64 and non-image blocks fail without echoing payloads', () => {
  const cases = [
    ['Res', { type: 'input_image', file_id: 'private-file-id' }],
    ['Res', { type: 'input_image', file_id: 'private-file-id', image_url: url }],
    ['Res', { type: 'input_image', image_url: 'http://private.invalid/image' }],
    ['Res', { type: 'input_image', image_url: 'data:image/svg+xml;base64,cHJpdmF0ZQ==' }],
    ['Res', { type: 'input_image', image_url: 'data:image/png;base64,private***' }],
    ['Res', { type: 'input_audio', data: 'private-audio' }],
    ['Chat', { type: 'image_url', image_url: { url: 'file:///private/image.png' } }],
    ['Chat', { type: 'input_audio', input_audio: { data: 'private-audio', format: 'wav' } }],
    ['Chat', { type: 'video_url', video_url: { url: 'https://private.invalid/video' } }],
    ['Chat', { type: 'future_block', text: 'private-text' }],
    ['Mes', { type: 'image', source: { type: 'file', file_id: 'private-file-id' } }],
    ['Mes', { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'private***' } }],
    ['Mes', { type: 'document', source: { type: 'url', url: 'https://private.invalid/document' } }],
  ];
  for (const [source, block] of cases) assert.throws(() => parseRequest(source, bodyFor(source, [block]), { direction: source + '->Mes' }), error => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.statusCode, 400);
    assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private/);
    return true;
  });
});

test('malformed text, message arrays and system media are safe request errors', () => {
  for (const [source, body] of [
    ['Res', bodyFor('Res', [{ type: 'input_text', text: 7 }])],
    ['Chat', bodyFor('Chat', [{ type: 'text', text: {} }])],
    ['Chat', { messages: {} }],
    ['Mes', { messages: [null] }],
    ['Res', { input: [{ role: 'system', content: [{ type: 'input_image', image_url: url }] }] }],
    ['Mes', { system: [{ type: 'image', source: { type: 'url', url } }], messages: [] }],
  ]) assert.throws(() => parseRequest(source, body), error => error.code === 'unsupported_feature' && error.statusCode === 400);
});

test('opaque Responses reasoning keeps public metadata, tools, IDs and history positions', () => {
  const reasoning = { type: 'reasoning', id: 'rs-1', status: 'completed', summary: [{ type: 'summary_text', text: 'public summary' }], content: [{ type: 'reasoning_text', text: 'public detail' }], encrypted_content: 'private-ciphertext' };
  const body = { tools: [{ type: 'function', name: 'ping' }], input: [
    { role: 'user', content: 'first' }, { role: 'assistant', content: 'checking' }, reasoning,
    { type: 'function_call', call_id: 'call-1', name: 'ping', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call-1', output: 'pong' },
    { type: 'reasoning', summary: [], encrypted_content: 'private-second' }, { role: 'user', content: 'last' },
  ] };
  for (const target of ['Chat', 'Mes']) {
    const request = parseRequest('Res', body, { direction: 'Res->' + target });
    assert.deepEqual(request.compatibilityWarnings, [{ code: 'opaque_reasoning_ignored', count: 2 }]);
    assert.deepEqual(request.reasoningMetadata, [{ messageIndex: 2, item: { type: 'reasoning', id: 'rs-1', summary: reasoning.summary, content: reasoning.content, status: 'completed' } }]);
    const payload = serializeRequest(target, request, 'fixture');
    assert.doesNotMatch(JSON.stringify(payload), /private-|public summary|public detail|signature|reasoning_content|thinking/);
    assert.deepEqual(payload.messages.map(message => message.role), target === 'Chat' ? ['user', 'assistant', 'tool', 'user'] : ['user', 'assistant', 'assistant', 'user', 'user']);
    assert.match(JSON.stringify(payload), /call-1/);
    assert.match(JSON.stringify(payload), /pong/);
    assert.deepEqual(body.input[2], reasoning);
  }
});

test('Responses-to-Responses retains opaque reasoning verbatim and emits no ignore warning', () => {
  const reasoning = { type: 'reasoning', id: 'rs-opaque', summary: [], encrypted_content: 'private-ciphertext' };
  for (const profile of [{}, { direction: 'Res->Res' }]) {
    const request = parseRequest('Res', { input: [{ role: 'user', content: 'hello' }, reasoning] }, profile);
    assert.equal(request.compatibilityWarnings, undefined);
    assert.deepEqual(serializeRequest('Res', request, 'fixture').input[1], reasoning);
  }
});

test('non-string encrypted reasoning is rejected without exposing it', () => {
  for (const encrypted_content of [null, 7, {}, [], false]) assert.throws(() => parseRequest('Res', { input: [{ type: 'reasoning', encrypted_content }] }, { direction: 'Res->Chat' }), error => {
    assert.equal(error.code, 'unsupported_feature');
    assert.equal(error.field, 'input.reasoning.encrypted_content');
    assert.equal(error.statusCode, 400);
    return true;
  });
});
