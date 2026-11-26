import crypto from 'node:crypto';
import { normalizeContent, serializeContent } from './protocol-media.mjs';

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
  if (type === 'web_search' || type === 'web_search_preview') {
    error.message = 'Hosted web_search requires a Responses upstream. Reapply Gateway setup to disable web_search for cross-protocol routes, or use a direct Responses provider.';
  }
  return error;
}

function unsupportedInputType(type, direction) {
  const error = featureError('input.type', direction);
  if (typeof type === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(type)) error.itemType = type;
  error.message = 'This Responses history item cannot be converted. Start a new session for this Gateway route, or continue with a compatible Responses provider.';
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
  if (protocol === 'Res' && value.type === 'custom' && typeof value.name === 'string') {
    const matches = tools.filter(tool => tool.kind === 'custom' && tool.name === value.name && (value.namespace ? tool.namespace === value.namespace : !tool.namespace));
    if (matches.length !== 1) throw featureError('tool_choice', direction);
    return { mode: 'function', name: targetToolName(matches[0]) };
  }
  if (typeof value === 'object' && value.type === 'function' && typeof (value.function?.name || value.name) === 'string') {
    const name = value.function?.name || value.name;
    if (protocol === 'Res') {
      const named = tools.filter((tool) => tool.kind !== 'tool_search' && tool.name === name && (value.namespace ? tool.namespace === value.namespace : !tool.namespace));
      const functions = named.filter(tool => (tool.kind || 'function') === 'function');
      const matches = functions.length ? functions : named.filter(tool => tool.kind === 'custom');
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

function toolResultContent(value, direction) {
  if (Array.isArray(value) && (!value.length || value.some((part) => part && typeof part === 'object' && 'type' in part))) {
    return normalizeContent('Res', value, () => featureError('input.output', direction));
  }
  return serializedToolValue(value);
}

function functionHistoryArguments(value, direction) {
  const serialized = serializedToolValue(value);
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw featureError('input.function_call.arguments', direction); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw featureError('input.function_call.arguments', direction);
  return serialized;
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
    const reasoningMetadata = [];
    const crossProtocol = direction === 'Res->Chat' || direction === 'Res->Mes';
    let ignoredOpaqueReasoning = 0;
    let separateAssistant = false;
    const raw = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : (body.input || []);
    if (!Array.isArray(raw)) throw featureError('input', direction);
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw featureError('input', direction);
      if (item.type === 'additional_tools') continue;
      if (item.type === 'reasoning') {
        if (item.encrypted_content !== undefined && typeof item.encrypted_content !== 'string') throw featureError('input.reasoning.encrypted_content', direction);
        const opaqueReasoning = typeof item.encrypted_content === 'string' && item.encrypted_content.length > 0;
        const summary = item.summary ?? [];
        if (!Array.isArray(summary) || summary.some(part => part?.type !== 'summary_text' || typeof part.text !== 'string')) throw featureError('input.reasoning.summary', direction);
        const content = item.content ?? [];
        if (!Array.isArray(content) || content.some(part => part?.type !== 'reasoning_text' || typeof part.text !== 'string')) throw featureError('input.reasoning.content', direction);
        if (crossProtocol && opaqueReasoning) ignoredOpaqueReasoning += 1;
        if (summary.length || content.length || (!crossProtocol && item.encrypted_content !== undefined)) {
          const metadata = { type: 'reasoning', ...(typeof item.id === 'string' ? { id: item.id } : {}), summary: summary.map(part => ({ type: 'summary_text', text: part.text })), ...(content.length ? { content: content.map(part => ({ type: 'reasoning_text', text: part.text })) } : {}), ...(['in_progress', 'completed', 'incomplete'].includes(item.status) ? { status: item.status } : {}), ...(!crossProtocol && item.encrypted_content !== undefined ? { encrypted_content: item.encrypted_content } : {}) };
          reasoningMetadata.push({ messageIndex: messages.filter(message => message.role !== 'system' && message.role !== 'developer').length, item: metadata });
        }
        if (summary.length || content.length || opaqueReasoning) separateAssistant = true;
        continue;
      }
      if (item.type === 'tool_search_output') {
        if (item.execution !== undefined && item.execution !== 'client') throw featureError('input.execution', direction);
        messages.push({ role: 'tool', id: item.call_id, content: JSON.stringify({ status: item.status || 'completed', tools: item.tools || [] }) });
      }
      else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') messages.push({ role: 'tool', id: item.call_id, content: toolResultContent(item.output, direction) });
      else if (['function_call', 'custom_tool_call', 'tool_search_call'].includes(item.type)) {
        const kind = item.type === 'tool_search_call' ? 'tool_search' : item.type === 'custom_tool_call' ? 'custom' : 'function';
        if (item.status === 'incomplete' || item.status === 'in_progress') throw featureError('input.' + item.type + '.status', direction);
        const name = kind === 'tool_search' ? 'tool_search' : item.name;
        const tool = toolForResponsesCall(tools, name, item.namespace, kind);
        if (kind === 'tool_search' && !tool) throw featureError('input.tool_search_call', direction);
        if (kind === 'tool_search' && item.execution !== undefined && item.execution !== 'client') throw featureError('input.execution', direction);
        const input = typeof item.input === 'string' ? item.input : JSON.stringify(item.input ?? '');
        const previous = messages.at(-1);
        const assistant = previous?.role === 'assistant' && !separateAssistant ? previous : { role: 'assistant' };
        separateAssistant = false;
        if (assistant !== previous) messages.push(assistant);
        assistant.toolCalls ??= [];
        assistant.toolCalls.push({
          id: item.call_id || item.id,
          name: tool ? targetToolName(tool) : item.name,
          ...(item.namespace ? { namespace: item.namespace } : {}),
          ...(kind === 'custom' ? { kind, input, arguments: JSON.stringify({ input }) } : { arguments: kind === 'tool_search' ? serializedToolValue(searchArguments(item.arguments, direction)) : functionHistoryArguments(item.arguments, direction) }),
          index: assistant.toolCalls.length,
        });
      }
      else {
        if (item.type !== undefined && item.type !== 'message') throw unsupportedInputType(item.type, direction);
        if (!['system', 'developer', 'user', 'assistant'].includes(item.role)) throw featureError('input.role', direction);
        messages.push({ role: item.role, content: normalizeContent('Res', item.content, () => featureError('input.content', direction), { allowImages: !['system', 'developer'].includes(item.role) }) });
        separateAssistant = false;
      }
    }
    const instructions = [typeof body.instructions === 'string' ? body.instructions : '', ...messages.filter(item => item.role === 'system' || item.role === 'developer').map(item => item.content)].filter(Boolean).join('\n') || undefined;
    return { messages: messages.filter(item => item.role !== 'system' && item.role !== 'developer'), instructions, ...(reasoningMetadata.length ? { reasoningMetadata } : {}), ...(ignoredOpaqueReasoning ? { compatibilityWarnings: [{ code: 'opaque_reasoning_ignored', count: ignoredOpaqueReasoning }] } : {}) };
  }
  if (body.messages !== undefined && !Array.isArray(body.messages)) throw featureError('messages', direction);
  if (protocol === 'Mes') {
    for (const item of body.messages || []) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !['user', 'assistant'].includes(item.role)) throw featureError('messages', direction);
      if (typeof item.content === 'string') { messages.push({ role: item.role, content: item.content }); continue; }
      if (!Array.isArray(item.content)) throw featureError('messages.content', direction);
      let pending = [];
      const flush = () => {
        if (pending.length) {
          const content = normalizeContent('Mes', pending, () => featureError('messages.content', direction));
          if (content.length) messages.push({ role: item.role, content });
          pending = [];
        }
      };
      for (const part of item.content) {
        if (part?.type === 'tool_use') {
          flush();
          const previous = messages.at(-1);
          const assistant = previous?.role === 'assistant' && previous.toolCalls ? previous : { role: 'assistant', toolCalls: [] };
          if (assistant !== previous) messages.push(assistant);
          assistant.toolCalls.push({ id: part.id, name: part.name, arguments: JSON.stringify(part.input || {}), index: assistant.toolCalls.length });
        } else if (part?.type === 'tool_result') {
          flush();
          messages.push({ role: 'tool', id: part.tool_use_id, content: normalizeContent('Mes', part.content, () => featureError('messages.tool_result.content', direction)) });
        } else pending.push(part);
      }
      flush();
    }
    return { messages, instructions: normalizeContent('Mes', body.system, () => featureError('system', direction), { allowImages: false }) || undefined };
  }
  for (const item of body.messages || []) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(item.role)) throw featureError('messages', direction);
    const content = normalizeContent('Chat', item.content, () => featureError('messages.content', direction), { allowImages: item.role === 'user' });
    if (item.role === 'tool') messages.push({ role: 'tool', id: item.tool_call_id, content });
    else if (item.tool_calls?.length) messages.push({ role: 'assistant', content, toolCalls: item.tool_calls.map((call, index) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}', index })) });
    else messages.push({ role: item.role, content });
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
  const compatibilityWarnings = [...(parsed.compatibilityWarnings || [])];
  let omittedImageDetail = 0;
  for (const message of parsed.messages) {
    const images = Array.isArray(message.content) ? message.content.filter(part => part.type === 'image') : [];
    if (images.length && direction.endsWith('->Chat') && message.role !== 'user') {
      const field = protocol === 'Res' ? message.role === 'tool' ? 'input.output' : 'input.content' : message.role === 'tool' ? 'messages.tool_result.content' : 'messages.content';
      throw featureError(field, direction);
    }
    if (direction.endsWith('->Mes')) omittedImageDetail += images.filter(part => part.detail === 'high' || part.detail === 'low').length;
  }
  if (omittedImageDetail) compatibilityWarnings.push({ code: 'image_detail_omitted', count: omittedImageDetail });
  const responseFormat = protocol === 'Res' ? normalizeResponseFormat(body.text?.format, direction) : normalizeResponseFormat(body.response_format, direction);
  const effort = protocol === 'Res' ? body.reasoning?.effort : protocol === 'Mes' ? body.output_config?.effort : body.reasoning_effort;
  const reasoningEffort = typeof effort === 'string' && effort.trim().length <= 32 ? effort.trim() || undefined : undefined;
  return { messages: parsed.messages, instructions: parsed.instructions, ...(parsed.reasoningMetadata ? { reasoningMetadata: parsed.reasoningMetadata } : {}), ...(compatibilityWarnings.length ? { compatibilityWarnings } : {}), tools, toolChoice: normalizeToolChoice(protocol, body.tool_choice, direction, tools), responseFormat, reasoningEffort, maxTokens: protocol === 'Res' ? body.max_output_tokens : protocol === 'Mes' ? body.max_tokens : (body.max_completion_tokens ?? body.max_tokens), stream: body.stream === true, candidateCount };
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

function serializeChatMessages(normalized) {
  const messages = normalized.instructions ? [{ role: 'system', content: normalized.instructions }, ...normalized.messages] : normalized.messages;
  const serialized = [];
  for (const item of messages) {
    let message;
    if (item.role === 'tool') {
      if (Array.isArray(item.content)) throw featureError('messages.tool.content', '->Chat');
      message = { role: 'tool', tool_call_id: item.id, content: item.content };
    } else {
      if (item.role !== 'user' && Array.isArray(item.content) && item.content.some(part => part.type === 'image')) throw featureError('messages.content', '->Chat');
      const content = serializeContent('Chat', item.content, item.role);
      message = item.toolCalls?.length ? { role: 'assistant', content: content || null, tool_calls: item.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : { role: item.role, content };
    }
    const previous = serialized.at(-1);
    if (message.role === 'assistant' && previous?.role === 'assistant' && (previous.tool_calls?.length || message.tool_calls?.length)) {
      // Chat keeps text and calls on one assistant turn; results must follow it.
      if (Array.isArray(previous.content) || Array.isArray(message.content)) {
        const blocks = value => Array.isArray(value) ? value : value ? [{ type: 'text', text: value }] : [];
        previous.content = [...blocks(previous.content), ...blocks(message.content)];
      } else previous.content = ((previous.content || '') + (message.content || '')) || null;
      previous.tool_calls = [...(previous.tool_calls || []), ...(message.tool_calls || [])];
    } else serialized.push(message);
  }
  return serialized;
}

export function serializeRequest(protocol, normalized, model) {
  const messages = normalized.messages;
  if (protocol === 'Chat') {
    const payload = { model, messages: serializeChatMessages(normalized) };
    const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
    const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
    if (normalized.responseFormat) payload.response_format = normalized.responseFormat.type === 'json_schema' ? { type: 'json_schema', json_schema: { name: normalized.responseFormat.name, schema: normalized.responseFormat.schema, ...(normalized.responseFormat.strict === undefined ? {} : { strict: normalized.responseFormat.strict }) } } : normalized.responseFormat;
    if (normalized.maxTokens) payload.max_completion_tokens = normalized.maxTokens;
    if (normalized.reasoningEffort) payload.reasoning_effort = normalized.reasoningEffort;
    return payload;
  }
  if (protocol === 'Mes') {
    const mesMessages = [];
    for (const item of messages) {
      if (item.role === 'system' || item.role === 'developer') continue;
      if (item.role === 'tool') {
        const previous = mesMessages.at(-1);
        if (previous?.role === 'user' && Array.isArray(previous.content) && previous.content.every((part) => part.type === 'tool_result')) {
          previous.content.push({ type: 'tool_result', tool_use_id: item.id, content: serializeContent('Mes', item.content) });
        } else {
          mesMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: item.id, content: serializeContent('Mes', item.content) }] });
        }
      } else if (item.toolCalls?.length) {
        const content = Array.isArray(item.content) ? serializeContent('Mes', item.content, item.role) : item.content ? [{ type: 'text', text: item.content }] : [];
        content.push(...item.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.arguments || '{}') })));
        mesMessages.push({ role: 'assistant', content });
      } else {
        mesMessages.push({ role: item.role, content: serializeContent('Mes', item.content, item.role) });
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
  const input = messages.flatMap((item, messageIndex) => {
    const metadata = (normalized.reasoningMetadata || []).filter(entry => entry.messageIndex === messageIndex).map(entry => entry.item);
    if (item.role === 'tool') return [...metadata, { type: 'function_call_output', call_id: item.id, output: serializeContent('Res', item.content) }];
    const content = item.toolCalls?.length && !item.content ? [] : [{ role: item.role, content: serializeContent('Res', item.content, item.role) }];
    return [...metadata, ...content, ...(item.toolCalls || []).map(call => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments }))];
  });
  input.push(...(normalized.reasoningMetadata || []).filter(entry => entry.messageIndex === messages.length).map(entry => entry.item));
  const payload = { model, input };
  if (normalized.instructions) payload.instructions = normalized.instructions;
  const tools = serializeTools(protocol, normalized.tools); if (tools) payload.tools = tools;
  const choice = serializeChoice(protocol, normalized.toolChoice); if (choice) payload.tool_choice = choice;
  if (normalized.responseFormat) payload.text = { format: normalized.responseFormat };
  if (normalized.reasoningEffort) payload.reasoning = { effort: normalized.reasoningEffort };
  if (normalized.maxTokens) payload.max_output_tokens = normalized.maxTokens;
  return payload;
}

function customInputFromArguments(argumentsText) {
  try {
    const parsed = typeof argumentsText === 'string' ? JSON.parse(argumentsText) : argumentsText;
    if (typeof parsed?.input === 'string') return parsed.input;
  } catch {}
  throw Object.assign(new Error('Invalid upstream custom tool input'), { code: 'upstream_error', statusCode: 502 });
}

function restoreToolCall(call, toolContext) {
  const tool = toolContext.find((item) => targetToolName(item) === call.name);
  if (!tool) return call;
  const restored = { ...call, name: tool.name, targetName: targetToolName(tool), kind: tool.kind || 'function' };
  if (tool.namespace) restored.namespace = tool.namespace;
  if (tool.kind === 'custom') restored.input = typeof call.input === 'string' ? call.input : customInputFromArguments(call.arguments);
  return restored;
}

function parseResponseToolCalls(calls, toolContext, finishReason) {
  return calls.filter(call => {
    const kind = toolContext.find(item => targetToolName(item) === call.name)?.kind || call.kind;
    return !incompleteReason(finishReason) || !['custom', 'tool_search'].includes(kind);
  }).map((call) => restoreToolCall(call, toolContext));
}

function incompleteReason(finishReason) {
  if (finishReason === 'length' || finishReason === 'max_tokens') return 'max_output_tokens';
  if (finishReason === 'content_filter' || finishReason === 'refusal') return 'content_filter';
  return null;
}

function responsesFinishReason(body) {
  if (body.status === 'failed') throw Object.assign(new Error('Upstream response reported an error'), { code: 'upstream_error', statusCode: 502 });
  if (body.status !== 'incomplete') return body.status;
  if (body.incomplete_details?.reason === 'max_output_tokens') return 'length';
  if (body.incomplete_details?.reason === 'content_filter') return 'content_filter';
  throw Object.assign(new Error('Upstream response has an unsupported incomplete reason'), { code: 'upstream_error', statusCode: 502 });
}

function chatFinishReason(finishReason, hasTools) {
  const incomplete = incompleteReason(finishReason);
  if (incomplete) return incomplete === 'max_output_tokens' ? 'length' : 'content_filter';
  return hasTools ? 'tool_calls' : 'stop';
}

function messagesFinishReason(finishReason, hasTools) {
  const incomplete = incompleteReason(finishReason);
  if (incomplete) return incomplete === 'max_output_tokens' ? 'max_tokens' : 'refusal';
  return hasTools ? 'tool_use' : 'end_turn';
}

export function parseResponse(protocol, body, toolContext = []) {
  if (protocol === 'Chat') {
    const message = body.choices?.[0]?.message || {};
    return { id: body.id, text: textParts(message.content) || (typeof message.refusal === 'string' ? message.refusal : ''), finishReason: body.choices?.[0]?.finish_reason, toolCalls: parseResponseToolCalls((message.tool_calls || []).map((call, index) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}', index })), toolContext, body.choices?.[0]?.finish_reason), usage: body.usage };
  }
  if (protocol === 'Mes') return { id: body.id, text: textParts(body.content), finishReason: body.stop_reason, toolCalls: parseResponseToolCalls((body.content || []).filter((item) => item.type === 'tool_use').map((call, index) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.input || {}), index })), toolContext, body.stop_reason), usage: body.usage };
  const finishReason = responsesFinishReason(body);
  return { id: body.id, text: textParts(body.output?.find((item) => item.type === 'message')?.content), finishReason, toolCalls: parseResponseToolCalls((body.output || []).filter((item) => item.type === 'function_call' || item.type === 'custom_tool_call').map((call, index) => ({ id: call.call_id, name: call.name, namespace: call.namespace, kind: call.type === 'custom_tool_call' ? 'custom' : 'function', arguments: call.arguments || '{}', input: call.input, index })), toolContext, finishReason), usage: body.usage };
}

export function serializeResponse(protocol, normalized, requestId) {
  if (protocol === 'Chat') return { id: normalized.id || 'chatcmpl_' + requestId, object: 'chat.completion', choices: [{ index: 0, message: normalized.toolCalls?.length ? { role: 'assistant', content: normalized.text || null, tool_calls: normalized.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: targetToolName(call), arguments: call.kind === 'custom' ? JSON.stringify({ input: call.input ?? customInputFromArguments(call.arguments) }) : call.arguments } })) } : { role: 'assistant', content: normalized.text }, finish_reason: chatFinishReason(normalized.finishReason, normalized.toolCalls?.length) }], usage: normalized.usage };
  if (protocol === 'Mes') return { id: normalized.id || 'msg_' + requestId, type: 'message', role: 'assistant', content: [...(normalized.text ? [{ type: 'text', text: normalized.text }] : []), ...(normalized.toolCalls || []).map((call) => ({ type: 'tool_use', id: call.id, name: targetToolName(call), input: call.kind === 'custom' ? { input: call.input ?? customInputFromArguments(call.arguments) } : JSON.parse(call.arguments || '{}') }))], stop_reason: messagesFinishReason(normalized.finishReason, normalized.toolCalls?.length), usage: normalized.usage };
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
    if (eventName === 'content_block_start' && payload.content_block?.type === 'text' && payload.content_block.text) return { type: 'text', text: payload.content_block.text };
    if (eventName === 'content_block_start' && payload.content_block?.type === 'tool_use') {
      const index = Number.isInteger(payload.index) ? payload.index : (state.nextToolIndex || 0);
      state.nextToolIndex = Math.max(state.nextToolIndex || 0, index + 1);
      state.sawTool = true;
      return { type: 'tools', tools: [{ index, id: payload.content_block.id, name: payload.content_block.name, ...(Object.keys(payload.content_block.input || {}).length ? { arguments: JSON.stringify(payload.content_block.input) } : {}) }] };
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
  if (['response.output_text.delta', 'response.refusal.delta'].includes(eventName)) return { type: 'text', text: payload.delta || '' };
  if (eventName === 'response.completed' || eventName === 'response.done') return { type: 'done', finishReason: 'completed' };
  if (eventName === 'response.incomplete') return { type: 'done', finishReason: responsesFinishReason({ ...payload.response, status: 'incomplete' }) };
  if (eventName === 'response.failed' || eventName === 'error') throw Object.assign(new Error('Upstream stream reported an error'), { code: 'upstream_error', statusCode: 502 });
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
  const buffered = [...state.responseCalls.values()].filter(call => !call.item);
  const reason = incompleteReason(event.finishReason);
  if ((!state.responseItems.length && !buffered.length && reason !== 'max_output_tokens') || buffered.some(call => !call.name)) {
    throw Object.assign(new Error('Converted stream has no complete output items'), { code: 'upstream_error', statusCode: 502 });
  }
  // Custom/search wrappers are executable only after a successful complete turn.
  const pending = reason ? buffered.filter(call => call.kind === 'function') : buffered;
  // Buffered custom and search calls receive their index when their added event is emitted.
  for (const call of pending) {
    call.outputIndex = state.responseItems.length;
    state.responseItems.push(call);
  }
  const status = reason ? 'incomplete' : 'completed';
  const result = state.responseItems.map(entry => finishResponsesItem(entry, requestId, status));
  const start = writeResponseStart(requestId, state);
  state.responseCompleted = true;
  return start + result.map(entry => entry.wire).join('') + convertedResponseFrame('response.' + status, {
    response: responseEnvelope(requestId, state, status, result.map(entry => entry.item), reason),
  });
}

function serializeMessagesStreamEvent(event, requestId, state) {
  const output = state.messagesOutput ??= { started: false, completed: false, blocks: [], tools: new Map() };
  if (output.completed || !['text', 'tools', 'done'].includes(event.type)) return '';
  let wire = '';
  if (!output.started) {
    output.started = true;
    wire += convertedResponseFrame('message_start', { message: {
      id: 'msg_' + requestId, type: 'message', role: 'assistant', model: state.model || '', content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 },
    } });
  }
  const startBlock = content_block => {
    const index = output.blocks.length;
    output.blocks.push(index);
    wire += convertedResponseFrame('content_block_start', { index, content_block });
    return index;
  };
  if (event.type === 'text' && event.text) {
    if (output.textIndex === undefined) output.textIndex = startBlock({ type: 'text', text: '' });
    wire += convertedResponseFrame('content_block_delta', { index: output.textIndex, delta: { type: 'text_delta', text: event.text } });
  } else if (event.type === 'tools') {
    for (const tool of event.tools) {
      const key = tool.index ?? 0;
      let call = output.tools.get(key);
      if (!call) {
        call = { id: tool.id, name: tool.name, arguments: '' };
        output.tools.set(key, call);
      }
      call.id ??= tool.id;
      call.name ??= tool.name;
      call.arguments += tool.arguments || '';
      if (!call.name) continue;
      const first = call.index === undefined;
      if (first) call.index = startBlock({ type: 'tool_use', id: call.id || 'tool_' + requestId + '_' + key, name: call.name, input: {} });
      const partial_json = first ? call.arguments : tool.arguments;
      if (partial_json) wire += convertedResponseFrame('content_block_delta', { index: call.index, delta: { type: 'input_json_delta', partial_json } });
    }
  } else if (event.type === 'done') {
    if ([...output.tools.values()].some(call => call.index === undefined)) throw Object.assign(new Error('Converted stream has an incomplete tool call'), { code: 'upstream_error', statusCode: 502 });
    output.completed = true;
    for (const index of output.blocks) wire += convertedResponseFrame('content_block_stop', { index });
    const stop_reason = messagesFinishReason(event.finishReason, output.tools.size);
    wire += convertedResponseFrame('message_delta', { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: state.usage?.output_tokens || 0 } });
    wire += convertedResponseFrame('message_stop', {});
  }
  return wire;
}

export function serializeStreamEvent(protocol, event, requestId, state = {}) {
  if (event.type === 'batch') return event.events.map(item => serializeStreamEvent(protocol, item, requestId, state)).join('');
  if (protocol === 'Chat') {
    if (event.type === 'done') return 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: chatFinishReason(event.finishReason, state.sawTool || event.finishReason === 'tool_calls' || event.finishReason === 'tool_use') }] }) + '\n\ndata: [DONE]\n\n';
    if (event.type === 'text') return 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }] }) + '\n\n';
    if (event.type === 'tools') return event.tools.map((tool) => 'data: ' + JSON.stringify({ id: 'chatcmpl_' + requestId, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: tool.index, ...(tool.id ? { id: tool.id, type: 'function' } : {}), function: { ...(tool.name ? { name: tool.name } : {}), arguments: tool.arguments || '' } }] }, finish_reason: null }] }) + '\n\n').join('');
    return '';
  }
  if (protocol === 'Mes') return serializeMessagesStreamEvent(event, requestId, state);
  return serializeResponsesStreamEvent(event, requestId, state);
}

export { featureError };
