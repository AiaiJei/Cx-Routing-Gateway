function featureError(field, direction, code = 'unsupported_feature') {
  const error = Object.assign(new Error('Unsupported protocol feature'), { code, statusCode: 400 });
  error.field = field;
  error.direction = direction;
  return error;
}

function textParts(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter((part) => ['text', 'input_text', 'output_text'].includes(part?.type)).map((part) => part.text || part.input_text || part.output_text || '').join('');
}

function normalizeToolChoice(protocol, value, direction) {
  if (value === undefined || value === null) return undefined;
  if (value === 'auto' || value === 'none' || value === 'required') return { mode: value };
  if (protocol === 'Mes' && value.type === 'auto') return { mode: 'auto' };
  if (protocol === 'Mes' && value.type === 'any') return { mode: 'required' };
  if (typeof value === 'object' && value.type === 'function' && typeof value.function?.name === 'string') return { mode: 'function', name: value.function.name };
  if (typeof value === 'object' && value.type === 'function' && typeof value.name === 'string') return { mode: 'function', name: value.name };
  if (typeof value === 'object' && value.type === 'tool' && typeof value.name === 'string') return { mode: 'function', name: value.name };
  throw featureError('tool_choice', direction);
}

function normalizeResponseFormat(value, direction) {
  if (value === undefined || value === null) return undefined;
  if (value.type === 'json_object') return { type: 'json_object' };
  if (value.type === 'json_schema' || value.type === 'json_schema') {
    const jsonSchema = value.json_schema || value;
    const result = { type: 'json_schema', name: jsonSchema.name, schema: jsonSchema.schema };
    const strict = jsonSchema.strict;
    if (strict !== undefined) result.strict = strict;
    return result;
  }
  throw featureError('response_format', direction);
}

function normalizeTools(protocol, tools, direction) {
  if (!tools) return [];
  if (!Array.isArray(tools)) throw featureError('tools', direction);
  return tools.map((tool) => {
    if (protocol === 'Chat') return { name: tool.function?.name, description: tool.function?.description, parameters: tool.function?.parameters };
    if (protocol === 'Mes') return { name: tool.name, description: tool.description, parameters: tool.input_schema };
    return { name: tool.name, description: tool.description, parameters: tool.parameters };
  }).map((tool) => {
    if (!tool.name || !tool.parameters) throw featureError('tools', direction);
    return tool;
  });
}

function normalizeMessages(protocol, body, direction) {
  const messages = [];
  if (protocol === 'Res') {
    const raw = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : (body.input || []);
    for (const item of raw) {
      if (item.type === 'function_call_output') messages.push({ role: 'tool', id: item.call_id, content: textParts(item.output) });
      else if (item.type === 'function_call') messages.push({ role: 'assistant', toolCalls: [{ id: item.call_id || item.id, name: item.name, arguments: item.arguments || '{}', index: 0 }] });
      else {
        if (Array.isArray(item.content) && item.content.some((part) => !['input_text', 'output_text', 'text'].includes(part?.type))) throw featureError('input.content', direction);
        messages.push({ role: item.role || 'user', content: textParts(item.content || item) });
      }
    }
    return { messages, instructions: typeof body.instructions === 'string' ? body.instructions : undefined };
  }
  if (protocol === 'Mes') {
    for (const item of body.messages || []) {
      if (typeof item.content === 'string') { messages.push({ role: item.role, content: item.content }); continue; }
      const blocks = Array.isArray(item.content) ? item.content : [];
      if (blocks.some((part) => !['text', 'input_text', 'output_text', 'tool_use', 'tool_result'].includes(part?.type))) throw featureError('messages.content', direction);
      const toolCalls = blocks.filter((part) => part.type === 'tool_use').map((call, index) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.input || {}), index }));
      const toolResults = blocks.filter((part) => part.type === 'tool_result').map((result) => ({ role: 'tool', id: result.tool_use_id, content: textParts(result.content) }));
      if (textParts(blocks)) messages.push({ role: item.role, content: textParts(blocks) });
      if (toolCalls.length) messages.push({ role: 'assistant', toolCalls });
      messages.push(...toolResults);
    }
    return { messages, instructions: textParts(body.system) || undefined };
  }
  for (const item of body.messages || []) {
    if (item.role === 'tool') messages.push({ role: 'tool', id: item.tool_call_id, content: textParts(item.content) });
    else if (item.tool_calls?.length) messages.push({ role: 'assistant', content: textParts(item.content), toolCalls: item.tool_calls.map((call, index) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}', index })) });
    else messages.push({ role: item.role, content: textParts(item.content) });
  }
  const instructions = messages.filter((item) => item.role === 'system' || item.role === 'developer').map((item) => item.content).join('\n') || undefined;
  return { messages: messages.filter((item) => item.role !== 'system' && item.role !== 'developer'), instructions };
}

export function parseRequest(protocol, body, profile = {}) {
  const direction = profile.direction || protocol;
  if (!body || typeof body !== 'object') throw featureError('body', direction);
  const candidateCount = body.n ?? 1;
  if (candidateCount !== 1) throw featureError('n', direction, 'multiple_candidates_unsupported');
  if (body.logprobs) throw featureError('logprobs', direction);
  if (body.modalities) throw featureError('modalities', direction);
  const parsed = normalizeMessages(protocol, body, direction);
  const responseFormat = protocol === 'Res' ? normalizeResponseFormat(body.text?.format, direction) : normalizeResponseFormat(body.response_format, direction);
  return { messages: parsed.messages, instructions: parsed.instructions, tools: normalizeTools(protocol, body.tools, direction), toolChoice: normalizeToolChoice(protocol, body.tool_choice, direction), responseFormat, maxTokens: protocol === 'Res' ? body.max_output_tokens : protocol === 'Mes' ? body.max_tokens : (body.max_completion_tokens ?? body.max_tokens), stream: body.stream === true, candidateCount };
}

function serializeTools(protocol, tools) {
  if (!tools?.length) return undefined;
  if (protocol === 'Chat') return tools.map((tool) => ({ type: 'function', function: tool }));
  if (protocol === 'Mes') return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
  return tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters }));
}

function serializeChoice(protocol, choice) {
  if (!choice) return undefined;
  if (choice.mode === 'function') return protocol === 'Mes' ? { type: 'tool', name: choice.name } : protocol === 'Chat' ? { type: 'function', function: { name: choice.name } } : { type: 'function', name: choice.name };
  return choice.mode;
}

export function serializeRequest(protocol, normalized, model) {
  const messages = normalized.messages;
  if (protocol === 'Chat') {
    const chatMessages = normalized.instructions ? [{ role: 'system', content: normalized.instructions }, ...messages] : messages;
    const payload = { model, messages: chatMessages.map((item) => item.role === 'tool' ? { role: 'tool', tool_call_id: item.id, content: item.content } : item.toolCalls?.length ? { role: 'assistant', content: item.content || null, tool_calls: item.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : { role: item.role, content: item.content }) };
    const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
    const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
    if (normalized.responseFormat) payload.response_format = normalized.responseFormat.type === 'json_schema' ? { type: 'json_schema', json_schema: { name: normalized.responseFormat.name, schema: normalized.responseFormat.schema, ...(normalized.responseFormat.strict === undefined ? {} : { strict: normalized.responseFormat.strict }) } } : normalized.responseFormat;
    if (normalized.maxTokens) payload.max_completion_tokens = normalized.maxTokens;
    return payload;
  }
  if (protocol === 'Mes') {
    const mesMessages = [];
    for (const item of messages) {
      if (item.role === 'system' || item.role === 'developer') continue;
      if (item.role === 'tool') {
        const previous = mesMessages.at(-1);
        if (previous?.role === 'user' && Array.isArray(previous.content) && previous.content.every((part) => part.type === 'tool_result')) {
          previous.content.push({ type: 'tool_result', tool_use_id: item.id, content: item.content });
        } else {
          mesMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: item.id, content: item.content }] });
        }
      } else if (item.toolCalls?.length) {
        mesMessages.push({ role: 'assistant', content: item.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') })) });
      } else {
        mesMessages.push({ role: item.role, content: item.content });
      }
    }
    const payload = { model, messages: mesMessages, max_tokens: normalized.maxTokens || 1024 };
    if (normalized.instructions) payload.system = normalized.instructions;
    const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
    const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
    if (normalized.responseFormat) payload.output_config = { format: { type: 'json_schema', schema: normalized.responseFormat.type === 'json_schema' ? normalized.responseFormat.schema : { type: 'object' } } };
    return payload;
  }
  const payload = { model, input: messages.map((item) => item.role === 'tool' ? { type: 'function_call_output', call_id: item.id, output: item.content } : item.toolCalls?.length ? item.toolCalls.map((call) => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments })) : { role: item.role, content: item.content }).flat() };
  if (normalized.instructions) payload.instructions = normalized.instructions;
  const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
  const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
  if (normalized.responseFormat) payload.text = { format: normalized.responseFormat };
  if (normalized.maxTokens) payload.max_output_tokens = normalized.maxTokens;
  return payload;
}

export function parseResponse(protocol, body) {
  if (protocol === 'Chat') {
    const message = body.choices?.[0]?.message || {};
    return { id: body.id, text: textParts(message.content) || (typeof message.refusal === 'string' ? message.refusal : ''), finishReason: body.choices?.[0]?.finish_reason, toolCalls: (message.tool_calls || []).map((call, index) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}', index })), usage: body.usage };
  }
  if (protocol === 'Mes') return { id: body.id, text: textParts(body.content), finishReason: body.stop_reason, toolCalls: (body.content || []).filter((item) => item.type === 'tool_use').map((call, index) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.input || {}), index })), usage: body.usage };
  return { id: body.id, text: textParts(body.output?.find((item) => item.type === 'message')?.content), finishReason: body.status, toolCalls: (body.output || []).filter((item) => item.type === 'function_call').map((call, index) => ({ id: call.call_id, name: call.name, arguments: call.arguments || '{}', index })), usage: body.usage };
}

export function serializeResponse(protocol, normalized, requestId) {
  if (protocol === 'Chat') return { id: normalized.id || 'chatcmpl_' + requestId, object: 'chat.completion', choices: [{ index: 0, message: normalized.toolCalls?.length ? { role: 'assistant', content: null, tool_calls: normalized.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : { role: 'assistant', content: normalized.text }, finish_reason: normalized.toolCalls?.length ? 'tool_calls' : 'stop' }], usage: normalized.usage };
  if (protocol === 'Mes') return { id: normalized.id || 'msg_' + requestId, type: 'message', role: 'assistant', content: normalized.toolCalls?.length ? normalized.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') })) : [{ type: 'text', text: normalized.text }], stop_reason: normalized.toolCalls?.length ? 'tool_use' : 'end_turn', usage: normalized.usage };
  return { id: normalized.id || 'resp_' + requestId, object: 'response', output: normalized.toolCalls?.length ? normalized.toolCalls.map((call) => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments })) : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: normalized.text }] }], status: 'completed', usage: normalized.usage };
}

export function parseStreamEvent(protocol, eventName, payload, state = {}) {
  if (payload === '[DONE]') return { type: 'done' };
  if (protocol === 'Chat') {
    const choice = payload.choices?.[0];
    const delta = choice?.delta || {};
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) { state.sawTool = true; return { type: 'tools', tools: delta.tool_calls.map((call) => ({ index: call.index ?? 0, id: call.id, name: call.function?.name, arguments: call.function?.arguments || '' })) }; }
    if (typeof delta.content === 'string' && delta.content) return { type: 'text', text: delta.content };
    if (choice?.finish_reason) return { type: 'done', finishReason: choice.finish_reason };
    return { type: 'ignore' };
  }
  if (protocol === 'Mes') {
    if (eventName === 'content_block_start' && payload.content_block?.type === 'tool_use') {
      const index = Number.isInteger(payload.index) ? payload.index : (state.nextToolIndex || 0);
      state.nextToolIndex = Math.max(state.nextToolIndex || 0, index + 1);
      state.sawTool = true;
      return { type: 'tools', tools: [{ index, id: payload.content_block.id, name: payload.content_block.name }] };
    }
    if (payload.delta?.type === 'input_json_delta') {
      const index = Number.isInteger(payload.index) ? payload.index : Math.max(0, (state.nextToolIndex || 1) - 1);
      state.sawTool = true;
      return { type: 'tools', tools: [{ index, arguments: payload.delta.partial_json || '' }] };
    }
    if (payload.delta?.type === 'text_delta' && payload.delta.text) return { type: 'text', text: payload.delta.text };
    if (eventName === 'message_stop') return { type: 'done', finishReason: state.sawTool ? 'tool_use' : 'end_turn' };
    return { type: 'ignore' };
  }
  if (eventName === 'response.output_item.added' && payload.item?.type === 'function_call') {
    const index = Number.isInteger(payload.output_index) ? payload.output_index : (state.nextToolIndex || 0);
    state.nextToolIndex = Math.max(state.nextToolIndex || 0, index + 1);
    state.sawTool = true;
    return { type: 'tools', tools: [{ index, id: payload.item.call_id || payload.item.id, name: payload.item.name }] };
  }
  if (eventName === 'response.function_call_arguments.delta') { state.sawTool = true; return { type: 'tools', tools: [{ index: payload.output_index ?? 0, arguments: payload.delta || '' }] }; }
  if (['response.output_text.delta', 'response.refusal.delta', 'response.reasoning_text.delta'].includes(eventName)) return { type: 'text', text: payload.delta || '' };
  if (eventName === 'response.completed' || eventName === 'response.done') return { type: 'done', finishReason: 'completed' };
  return { type: 'ignore' };
}

export function serializeStreamEvent(protocol, event, requestId) {
  if (protocol === 'Chat') {
    if (event.type === 'done') return 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: event.finishReason === 'end_turn' ? 'stop' : event.finishReason === 'tool_use' || event.finishReason === 'tool_calls' ? 'tool_calls' : event.finishReason || 'stop' }] }) + '\n\ndata: [DONE]\n\n';
    if (event.type === 'text') return 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }] }) + '\n\n';
    if (event.type === 'tools') return event.tools.map((tool) => 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: tool.index, ...(tool.id ? { id: tool.id, type: 'function' } : {}), function: { ...(tool.name ? { name: tool.name } : {}), arguments: tool.arguments || '' } }] }, finish_reason: null }] }) + '\n\n').join('');
    return '';
  }
  if (protocol === 'Mes') {
    if (event.type === 'done') return 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    if (event.type === 'text') return 'event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: event.text } }) + '\n\n';
    if (event.type === 'tools') return event.tools.map((tool) => (tool.id || tool.name ? 'event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start', index: tool.index, content_block: { type: 'tool_use', id: tool.id || 'tool_' + requestId + '_' + tool.index, name: tool.name || '', input: {} } }) + '\n\n' : '') + (tool.arguments ? 'event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: tool.index, delta: { type: 'input_json_delta', partial_json: tool.arguments } }) + '\n\n' : '')).join('');
    return '';
  }
  if (event.type === 'done') return 'event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response: { id: 'resp_' + requestId, status: 'completed' } }) + '\n\n';
  if (event.type === 'text') return 'event: response.output_text.delta\ndata: ' + JSON.stringify({ type: 'response.output_text.delta', delta: event.text }) + '\n\n';
  if (event.type === 'tools') return event.tools.map((tool) => (tool.id || tool.name ? 'event: response.output_item.added\ndata: ' + JSON.stringify({ type: 'response.output_item.added', output_index: tool.index, item: { type: 'function_call', id: tool.id || 'fc_' + requestId + '_' + tool.index, call_id: tool.id || 'call_' + requestId + '_' + tool.index, name: tool.name || '', arguments: '' } }) + '\n\n' : '') + (tool.arguments ? 'event: response.function_call_arguments.delta\ndata: ' + JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: tool.index, delta: tool.arguments }) + '\n\n' : '')).join('');
  return '';
}

export { featureError };
