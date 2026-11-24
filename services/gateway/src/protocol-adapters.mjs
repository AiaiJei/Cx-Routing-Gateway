import crypto from 'node:crypto';

function featureError(field, direction, code = 'unsupported_feature') {
  const error = Object.assign(new Error('Unsupported protocol feature'), { code, statusCode: 400 });
  error.field = field;
  error.direction = direction;
  return error;
}

function unsupportedToolType(type, direction) {
  const error = featureError('tools.type', direction);
  if (!['function', 'custom', 'namespace', 'tool_search'].includes(type)
    && typeof type === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(type)) error.toolType = type;
  return error;
}

function textParts(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter((part) => ['text', 'input_text', 'output_text'].includes(part?.type)).map((part) => part.text || part.input_text || part.output_text || '').join('');
}

function targetToolName(tool) {
  return tool.targetName || tool.name;
}

function makeTargetToolName(kind, namespace, name, usedNames) {
  const sourceName = namespace ? namespace + '__' + name : name;
  let base = sourceName.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!base) base = 'tool';
  if (base.length <= 64 && !usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  const seed = JSON.stringify([kind, namespace || '', name]);
  let suffix = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 10);
  let candidate = base.slice(0, 52) + '__' + suffix;
  let attempt = 0;
  while (usedNames.has(candidate)) {
    attempt += 1;
    suffix = crypto.createHash('sha256').update(seed + '\0' + attempt).digest('hex').slice(0, 10);
    candidate = base.slice(0, 52) + '__' + suffix;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeToolChoice(protocol, value, direction, tools = []) {
  if (value === undefined || value === null) return undefined;
  if (value === 'auto' || value === 'none' || value === 'required') return { mode: value };
  if (protocol === 'Mes' && value.type === 'auto') return { mode: 'auto' };
  if (protocol === 'Mes' && value.type === 'any') return { mode: 'required' };
  if (protocol === 'Mes' && value.type === 'none') return { mode: 'none' };
  if (protocol === 'Res' && value.type === 'tool_search') {
    const matches = tools.filter((tool) => tool.kind === 'tool_search');
    if (matches.length !== 1) throw featureError('tool_choice', direction);
    return { mode: 'function', name: targetToolName(matches[0]) };
  }
  if (typeof value === 'object' && value.type === 'function' && typeof (value.function?.name || value.name) === 'string') {
    const name = value.function?.name || value.name;
    if (protocol === 'Res') {
      const matches = tools.filter((tool) => tool.kind !== 'tool_search' && tool.name === name && (value.namespace ? tool.namespace === value.namespace : !tool.namespace));
      if (matches.length !== 1) throw featureError('tool_choice', direction);
      return { mode: 'function', name: targetToolName(matches[0]) };
    }
    return { mode: 'function', name };
  }
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

function collectResponsesTools(body, direction) {
  const tools = [];
  const collect = (definitions) => {
    if (definitions === undefined) return;
    if (!Array.isArray(definitions)) throw featureError('tools', direction);
    tools.push(...definitions);
  };
  collect(body.tools);
  collect(body.additional_tools?.tools);
  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (item?.type === 'additional_tools' || item?.type === 'tool_search_output') collect(item.tools);
    }
  }
  return tools;
}

function normalizeTools(protocol, tools, direction) {
  if (!tools) return [];
  if (!Array.isArray(tools)) throw featureError('tools', direction);
  if (protocol !== 'Res') {
    return tools.map((tool) => {
    if (protocol === 'Chat') return { name: tool.function?.name, description: tool.function?.description, parameters: tool.function?.parameters };
    if (protocol === 'Mes') return { name: tool.name, description: tool.description, parameters: tool.input_schema };
    }).map((tool) => {
      if (!tool.name || !tool.parameters) throw featureError('tools', direction);
      return tool;
    });
  }

  const normalized = [];
  const usedNames = new Set();
  const identities = new Set();
  const addTool = (source, namespace, namespaceDescription) => {
    const kind = source.type === 'tool_search' ? 'tool_search' : source.type === 'custom' ? 'custom' : 'function';
    const name = kind === 'tool_search' ? 'tool_search' : source.name;
    if (typeof name !== 'string' || !name) throw featureError('tools.name', direction);
    const descriptions = [namespaceDescription, source.description].filter((value) => typeof value === 'string' && value.trim());
    let parameters;
    let format;
    if (kind === 'tool_search') {
      if (source.execution !== undefined && source.execution !== 'client') throw featureError('tools.execution', direction);
      parameters = {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'integer' } },
        required: ['query'],
        additionalProperties: false,
      };
    } else if (kind === 'custom') {
      format = source.format === undefined ? { type: 'text' } : source.format;
      if (!format || typeof format !== 'object' || Array.isArray(format)) throw featureError('tools.format', direction);
      if (format.type === 'grammar') {
        if (!['lark', 'regex'].includes(format.syntax) || typeof format.definition !== 'string' || !format.definition.trim()) {
          throw featureError('tools.format', direction);
        }
      } else if (format.type !== 'text') {
        throw featureError('tools.format', direction);
      }
      descriptions.push('Original custom input format: ' + JSON.stringify(format));
      parameters = {
        type: 'object',
        properties: { input: { type: 'string' } },
        required: ['input'],
        additionalProperties: false,
      };
    } else {
      parameters = source.parameters === undefined ? { type: 'object', properties: {} } : source.parameters;
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw featureError('tools.parameters', direction);
    }
    const identity = JSON.stringify([kind, namespace || '', name]);
    if (identities.has(identity)) return;
    identities.add(identity);
    const targetName = makeTargetToolName(kind, namespace, name, usedNames);
    const description = descriptions.join('\n\n') || undefined;
    const tool = { name, description, parameters };
    if (namespace || kind !== 'function' || targetName !== name) {
      tool.targetName = targetName;
      tool.kind = kind;
      if (namespace) tool.namespace = namespace;
    }
    if (kind === 'custom') tool.format = format;
    if (source.strict !== undefined) tool.strict = source.strict;
    normalized.push(tool);
  };

  for (const tool of tools) {
    if (tool?.type === 'namespace') {
      if (typeof tool.name !== 'string' || !tool.name || !Array.isArray(tool.tools)) throw featureError('tools.namespace', direction);
      for (const member of tool.tools) {
        if (member?.type !== 'function' && member?.type !== 'custom') throw unsupportedToolType(member?.type, direction);
        addTool(member, tool.name, tool.description);
      }
    } else if (tool?.type === 'function' || (tool?.type === undefined && typeof tool?.name === 'string')) {
      addTool(tool, undefined, undefined);
    } else if (tool?.type === 'custom' || tool?.type === 'tool_search') {
      addTool(tool, undefined, undefined);
    } else {
      throw unsupportedToolType(tool?.type, direction);
    }
  }
  return normalized;
}

function toolForResponsesCall(tools, name, namespace, kind) {
  return tools.find((tool) => (tool.kind || 'function') === kind && tool.name === name && (namespace ? tool.namespace === namespace : !tool.namespace));
}

function serializedToolValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {});
}

function toolResultContent(value) {
  if (Array.isArray(value) && value.every((part) => ['text', 'input_text', 'output_text'].includes(part?.type))) return textParts(value);
  return serializedToolValue(value);
}

function searchArguments(value, direction) {
  const invalid = () => direction === 'Chat->Res'
    ? Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 })
    : featureError('tool_search.arguments', direction);
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw invalid(); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.query !== 'string'
    || (parsed.limit !== undefined && !Number.isInteger(parsed.limit))) throw invalid();
  return parsed;
}

function normalizeMessages(protocol, body, direction, tools = []) {
  const messages = [];
  if (protocol === 'Res') {
    const raw = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : (body.input || []);
    for (const item of raw) {
      if (item.type === 'additional_tools') continue;
      if (item.type === 'tool_search_output') {
        messages.push({ role: 'tool', id: item.call_id, content: JSON.stringify({ status: item.status || 'completed', tools: item.tools || [] }) });
      }
      else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') messages.push({ role: 'tool', id: item.call_id, content: toolResultContent(item.output) });
      else if (['function_call', 'custom_tool_call', 'tool_search_call'].includes(item.type)) {
        const kind = item.type === 'tool_search_call' ? 'tool_search' : item.type === 'custom_tool_call' ? 'custom' : 'function';
        const name = kind === 'tool_search' ? 'tool_search' : item.name;
        const tool = toolForResponsesCall(tools, name, item.namespace, kind);
        if (kind === 'tool_search' && !tool) throw featureError('input.tool_search_call', direction);
        if (kind === 'tool_search' && item.execution !== undefined && item.execution !== 'client') throw featureError('input.execution', direction);
        const input = typeof item.input === 'string' ? item.input : JSON.stringify(item.input ?? '');
        const previous = messages.at(-1);
        const assistant = previous?.role === 'assistant' ? previous : { role: 'assistant' };
        if (assistant !== previous) messages.push(assistant);
        assistant.toolCalls ??= [];
        assistant.toolCalls.push({
          id: item.call_id || item.id,
          name: tool ? targetToolName(tool) : item.name,
          ...(item.namespace ? { namespace: item.namespace } : {}),
          ...(kind === 'custom' ? { kind, input, arguments: JSON.stringify({ input }) } : { arguments: serializedToolValue(kind === 'tool_search' ? searchArguments(item.arguments, direction) : item.arguments) }),
          index: assistant.toolCalls.length,
        });
      }
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
  const tools = normalizeTools(protocol, protocol === 'Res' ? collectResponsesTools(body, direction) : body.tools, direction);
  const parsed = normalizeMessages(protocol, body, direction, tools);
  const responseFormat = protocol === 'Res' ? normalizeResponseFormat(body.text?.format, direction) : normalizeResponseFormat(body.response_format, direction);
  const effort = protocol === 'Res' ? body.reasoning?.effort : protocol === 'Mes' ? body.output_config?.effort : undefined;
  const reasoningEffort = typeof effort === 'string' && effort.trim().length <= 32 ? effort.trim() || undefined : undefined;
  return { messages: parsed.messages, instructions: parsed.instructions, tools, toolChoice: normalizeToolChoice(protocol, body.tool_choice, direction, tools), responseFormat, reasoningEffort, maxTokens: protocol === 'Res' ? body.max_output_tokens : protocol === 'Mes' ? body.max_tokens : (body.max_completion_tokens ?? body.max_tokens), stream: body.stream === true, candidateCount };
}

function serializeTools(protocol, tools) {
  if (!tools?.length) return undefined;
  if (protocol === 'Chat') return tools.map((tool) => ({ type: 'function', function: { name: targetToolName(tool), ...(tool.description ? { description: tool.description } : {}), parameters: tool.parameters, ...(tool.strict === undefined ? {} : { strict: tool.strict }) } }));
  if (protocol === 'Mes') return tools.map((tool) => ({ name: targetToolName(tool), ...(tool.description ? { description: tool.description } : {}), input_schema: tool.parameters }));
  return tools.map((tool) => ({ type: 'function', name: targetToolName(tool), ...(tool.description ? { description: tool.description } : {}), parameters: tool.parameters }));
}

function serializeChoice(protocol, choice) {
  if (!choice) return undefined;
  if (protocol === 'Mes') {
    if (choice.mode === 'function') return { type: 'tool', name: choice.name };
    return { type: choice.mode === 'required' ? 'any' : choice.mode };
  }
  if (choice.mode === 'function') return protocol === 'Chat' ? { type: 'function', function: { name: choice.name } } : { type: 'function', name: choice.name };
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
        const content = item.content ? [{ type: 'text', text: item.content }] : [];
        content.push(...item.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') })));
        mesMessages.push({ role: 'assistant', content });
      } else {
        mesMessages.push({ role: item.role, content: item.content });
      }
    }
    const payload = { model, messages: mesMessages, max_tokens: normalized.maxTokens || 1024 };
    if (normalized.instructions) payload.system = normalized.instructions;
    const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
    const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
    if (normalized.reasoningEffort || normalized.responseFormat) {
      payload.output_config = {
        ...(normalized.reasoningEffort ? { effort: normalized.reasoningEffort } : {}),
        ...(normalized.responseFormat ? { format: { type: 'json_schema', schema: normalized.responseFormat.type === 'json_schema' ? normalized.responseFormat.schema : { type: 'object' } } } : {}),
      };
    }
    return payload;
  }
  const payload = { model, input: messages.map((item) => item.role === 'tool' ? { type: 'function_call_output', call_id: item.id, output: item.content } : item.toolCalls?.length ? item.toolCalls.map((call) => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments })) : { role: item.role, content: item.content }).flat() };
  if (normalized.instructions) payload.instructions = normalized.instructions;
  const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
  const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
  if (normalized.responseFormat) payload.text = { format: normalized.responseFormat };
  if (normalized.reasoningEffort) payload.reasoning = { effort: normalized.reasoningEffort };
  if (normalized.maxTokens) payload.max_output_tokens = normalized.maxTokens;
  return payload;
}

function customInputFromArguments(argumentsText) {
  if (typeof argumentsText !== 'string') return JSON.stringify(argumentsText ?? '');
  try {
    const parsed = JSON.parse(argumentsText);
    if (typeof parsed?.input === 'string') return parsed.input;
  } catch {}
  return argumentsText;
}

function restoreToolCall(call, toolContext) {
  const tool = toolContext.find((item) => targetToolName(item) === call.name);
  if (!tool) return call;
  const restored = { ...call, name: tool.name, targetName: targetToolName(tool), kind: tool.kind || 'function' };
  if (tool.namespace) restored.namespace = tool.namespace;
  if (tool.kind === 'custom') restored.input = customInputFromArguments(call.arguments);
  return restored;
}

function parseResponseToolCalls(calls, toolContext) {
  return calls.map((call) => restoreToolCall(call, toolContext));
}

function incompleteReason(finishReason) {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'max_output_tokens';
  if (finishReason === 'content_filter') return 'content_filter';
  return null;
}

export function parseResponse(protocol, body, toolContext = []) {
  if (protocol === 'Chat') {
    const message = body.choices?.[0]?.message || {};
    return { id: body.id, text: textParts(message.content) || (typeof message.refusal === 'string' ? message.refusal : ''), finishReason: body.choices?.[0]?.finish_reason, toolCalls: parseResponseToolCalls((message.tool_calls || []).map((call, index) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}', index })), toolContext), usage: body.usage };
  }
  if (protocol === 'Mes') return { id: body.id, text: textParts(body.content), finishReason: body.stop_reason, toolCalls: parseResponseToolCalls((body.content || []).filter((item) => item.type === 'tool_use').map((call, index) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.input || {}), index })), toolContext), usage: body.usage };
  return { id: body.id, text: textParts(body.output?.find((item) => item.type === 'message')?.content), finishReason: body.status, toolCalls: parseResponseToolCalls((body.output || []).filter((item) => item.type === 'function_call' || item.type === 'custom_tool_call').map((call, index) => ({ id: call.call_id, name: call.name, namespace: call.namespace, kind: call.type === 'custom_tool_call' ? 'custom' : 'function', arguments: call.arguments || '{}', input: call.input, index })), toolContext), usage: body.usage };
}

export function serializeResponse(protocol, normalized, requestId) {
  if (protocol === 'Chat') return { id: normalized.id || 'chatcmpl_' + requestId, object: 'chat.completion', choices: [{ index: 0, message: normalized.toolCalls?.length ? { role: 'assistant', content: null, tool_calls: normalized.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: targetToolName(call), arguments: call.kind === 'custom' ? JSON.stringify({ input: call.input ?? customInputFromArguments(call.arguments) }) : call.arguments } })) } : { role: 'assistant', content: normalized.text }, finish_reason: normalized.toolCalls?.length ? 'tool_calls' : 'stop' }], usage: normalized.usage };
  if (protocol === 'Mes') return { id: normalized.id || 'msg_' + requestId, type: 'message', role: 'assistant', content: normalized.toolCalls?.length ? normalized.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: targetToolName(call), input: call.kind === 'custom' ? { input: call.input ?? customInputFromArguments(call.arguments) } : JSON.parse(call.arguments || '{}') })) : [{ type: 'text', text: normalized.text }], stop_reason: normalized.toolCalls?.length ? 'tool_use' : 'end_turn', usage: normalized.usage };
  const reason = incompleteReason(normalized.finishReason);
  const status = reason ? 'incomplete' : 'completed';
  const output = [];
  if (normalized.text) {
    output.push({
      type: 'message', id: 'msg_' + requestId + '_0', role: 'assistant', status,
      content: [{ type: 'output_text', text: normalized.text, annotations: [], logprobs: [] }],
    });
  }
  for (const call of normalized.toolCalls || []) {
    const suffix = requestId + '_' + output.length;
    const call_id = call.id || 'call_' + suffix;
    const named = { name: call.name, ...(call.namespace ? { namespace: call.namespace } : {}) };
    if (call.kind === 'tool_search') {
      output.push({ type: 'tool_search_call', id: call.id || 'tsc_' + suffix, call_id, status: 'completed', execution: 'client', arguments: searchArguments(call.arguments, 'Chat->Res') });
    } else if (call.kind === 'custom') {
      output.push({ type: 'custom_tool_call', id: 'ctc_' + suffix, call_id, ...named, input: call.input ?? customInputFromArguments(call.arguments) });
    } else {
      output.push({ type: 'function_call', id: 'fc_' + suffix, call_id, ...named, status, arguments: call.arguments });
    }
  }
  return { id: normalized.id || 'resp_' + requestId, object: 'response', output, status, incomplete_details: reason ? { reason } : null, usage: normalized.usage };
}

export function parseStreamEvent(protocol, eventName, payload, state = {}) {
  if (payload === '[DONE]') return { type: 'done' };
  if (protocol === 'Chat') {
    const choice = payload.choices?.[0];
    const delta = choice?.delta || {};
    const events = [];
    const text = textParts(delta.content) || (typeof delta.refusal === 'string' ? delta.refusal : '');
    if (text) events.push({ type: 'text', text });
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
      state.sawTool = true;
      events.push({ type: 'tools', tools: delta.tool_calls.map((call) => ({
        index: call.index ?? 0, id: call.id, name: call.function?.name, arguments: call.function?.arguments || '',
      })) });
    }
    if (choice?.finish_reason) events.push({ type: 'done', finishReason: choice.finish_reason });
    if (events.length > 1) return { type: 'batch', events };
    return events[0] || { type: 'ignore' };
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
    if (eventName === 'message_delta' && typeof payload.delta?.stop_reason === 'string') state.messagesStopReason = payload.delta.stop_reason;
    if (eventName === 'message_stop') return { type: 'done', finishReason: state.messagesStopReason || (state.sawTool ? 'tool_use' : 'end_turn') };
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

function responseFrame(eventName, payload) {
  return 'event: ' + eventName + '\ndata: ' + JSON.stringify(payload) + '\n\n';
}

function convertedResponseFrame(type, fields) {
  return responseFrame(type, { type, ...fields });
}

function responseEnvelope(requestId, state, status, output, reason = null) {
  return {
    id: 'resp_' + requestId, object: 'response', created_at: state.createdAt,
    status, ...(state.model ? { model: state.model } : {}), output,
    error: null, incomplete_details: reason ? { reason } : null, usage: status === 'in_progress' ? null : (state.usage ?? null),
  };
}

function writeResponseStart(requestId, state) {
  if (state.responseStarted) return '';
  state.responseStarted = true;
  state.createdAt ??= Math.floor(Date.now() / 1000);
  const response = responseEnvelope(requestId, state, 'in_progress', []);
  return convertedResponseFrame('response.created', { response })
    + convertedResponseFrame('response.in_progress', { response });
}

function streamResponsesText(text, requestId, state) {
  if (!text) return '';
  let message = state.responseMessage;
  let wire = writeResponseStart(requestId, state);
  if (!message) {
    const outputIndex = state.responseItems.length;
    const item = { type: 'message', id: 'msg_' + requestId + '_' + outputIndex, role: 'assistant', status: 'in_progress', content: [] };
    message = { item, outputIndex, text: '' };
    state.responseMessage = message;
    state.responseItems.push(message);
    wire += convertedResponseFrame('response.output_item.added', { output_index: outputIndex, item });
    wire += convertedResponseFrame('response.content_part.added', {
      item_id: item.id, output_index: outputIndex, content_index: 0,
      part: { type: 'output_text', text: '', annotations: [], logprobs: [] },
    });
  }
  message.text += text;
  return wire + convertedResponseFrame('response.output_text.delta', {
    item_id: message.item.id, output_index: message.outputIndex, content_index: 0, delta: text, logprobs: [],
  });
}

function streamResponsesTools(tools, requestId, state) {
  const frames = [];
  for (const tool of tools) {
    const index = Number.isInteger(tool.index) ? tool.index : 0;
    let call = state.responseCalls.get(index);
    if (!call) {
      call = { arguments: '' };
      state.responseCalls.set(index, call);
    }
    call.callId ??= tool.id;
    call.name ??= tool.name;
    call.arguments += tool.arguments || '';
    if (!call.name) continue;
    const descriptor = state.toolContext?.find(item => targetToolName(item) === call.name);
    call.kind = descriptor?.kind || 'function';
    call.originalName = descriptor?.name || call.name;
    call.namespace = descriptor?.namespace;
    if (call.kind !== 'function') continue;
    const first = !call.item;
    if (first) {
      call.outputIndex = state.responseItems.length;
      state.responseItems.push(call);
      const suffix = requestId + '_' + call.outputIndex;
      call.callId ||= 'call_' + suffix;
      call.item = {
        type: 'function_call', id: 'fc_' + suffix, call_id: call.callId, name: call.originalName,
        ...(call.namespace ? { namespace: call.namespace } : {}), status: 'in_progress', arguments: '',
      };
      frames.push(writeResponseStart(requestId, state));
      frames.push(convertedResponseFrame('response.output_item.added', { output_index: call.outputIndex, item: call.item }));
    }
    const delta = first ? call.arguments : tool.arguments;
    if (delta) frames.push(convertedResponseFrame('response.function_call_arguments.delta', {
      output_index: call.outputIndex, delta, item_id: call.item.id,
    }));
  }
  return frames.join('');
}

function finishResponsesItem(entry, requestId, status) {
  const output_index = entry.outputIndex;
  if (entry.text !== undefined) {
    const part = { type: 'output_text', text: entry.text, annotations: [], logprobs: [] };
    const item = { ...entry.item, status, content: [part] };
    const position = { item_id: item.id, output_index, content_index: 0 };
    return { item, wire: convertedResponseFrame('response.output_text.done', { ...position, text: entry.text, logprobs: [] })
      + convertedResponseFrame('response.content_part.done', { ...position, part })
      + convertedResponseFrame('response.output_item.done', { output_index, item }) };
  }
  const suffix = requestId + '_' + output_index;
  const call_id = entry.callId || 'call_' + suffix;
  const named = { name: entry.originalName, ...(entry.namespace ? { namespace: entry.namespace } : {}) };
  let item;
  let wire;
  if (entry.kind === 'custom') {
    const input = customInputFromArguments(entry.arguments);
    item = { type: 'custom_tool_call', id: 'ctc_' + suffix, call_id, ...named, input };
    const position = { item_id: item.id, output_index };
    wire = convertedResponseFrame('response.output_item.added', { output_index, item: { ...item, input: '' } })
      + convertedResponseFrame('response.custom_tool_call_input.delta', { ...position, delta: input })
      + convertedResponseFrame('response.custom_tool_call_input.done', { ...position, input });
  } else if (entry.kind === 'tool_search') {
    item = { type: 'tool_search_call', id: 'tsc_' + suffix, call_id, status, execution: 'client', arguments: searchArguments(entry.arguments, 'Chat->Res') };
    wire = convertedResponseFrame('response.output_item.added', { output_index, item: { ...item, status: 'in_progress' } });
  } else {
    const args = status === 'completed' ? (entry.arguments || '{}') : entry.arguments;
    item = { ...entry.item, status, arguments: args };
    wire = convertedResponseFrame('response.function_call_arguments.done', {
      output_index, item_id: item.id, name: item.name, arguments: item.arguments,
    });
  }
  return { item, wire: wire + convertedResponseFrame('response.output_item.done', { output_index, item }) };
}

function serializeResponsesStreamEvent(event, requestId, state) {
  if (state.responseCompleted) return '';
  state.responseItems ??= [];
  state.responseCalls ??= new Map();
  if (event.type === 'text') return streamResponsesText(event.text, requestId, state);
  if (event.type === 'tools') return streamResponsesTools(event.tools, requestId, state);
  if (event.type !== 'done') return '';
  const pending = [...state.responseCalls.values()].filter(call => !call.item);
  if ((!state.responseItems.length && !pending.length) || pending.some(call => !call.name)) {
    throw Object.assign(new Error('Converted stream has no complete output items'), { code: 'upstream_error', statusCode: 502 });
  }
  // Buffered custom and search calls receive their index when their added event is emitted.
  for (const call of pending) {
    call.outputIndex = state.responseItems.length;
    state.responseItems.push(call);
  }
  const reason = incompleteReason(event.finishReason);
  const status = reason ? 'incomplete' : 'completed';
  const result = state.responseItems.map(entry => finishResponsesItem(entry, requestId, status));
  const start = writeResponseStart(requestId, state);
  state.responseCompleted = true;
  return start + result.map(entry => entry.wire).join('') + convertedResponseFrame('response.' + status, {
    response: responseEnvelope(requestId, state, status, result.map(entry => entry.item), reason),
  });
}

export function serializeStreamEvent(protocol, event, requestId, state = {}) {
  if (event.type === 'batch') return event.events.map(item => serializeStreamEvent(protocol, item, requestId, state)).join('');
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
  return serializeResponsesStreamEvent(event, requestId, state);
}

export { featureError };
