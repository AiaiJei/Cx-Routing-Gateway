import { createRequestMetrics } from './request-metrics.mjs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';

const MAX_BODY = 4 * 1024 * 1024;
const pathProtocols = { '/v1/responses': 'Res', '/v1/messages': 'Mes', '/v1/chat/completions': 'Chat' };
const upstreamStatusMap = new Map([
  [400, { clientStatus: 400, errorCode: 'upstream_http_400' }],
  [401, { clientStatus: 401, errorCode: 'upstream_http_401' }],
  [402, { clientStatus: 402, errorCode: 'upstream_http_402' }],
  [403, { clientStatus: 403, errorCode: 'upstream_http_403' }],
  [404, { clientStatus: 404, errorCode: 'upstream_http_404' }],
  [408, { clientStatus: 408, errorCode: 'upstream_http_408' }],
  [409, { clientStatus: 409, errorCode: 'upstream_http_409' }],
  [413, { clientStatus: 413, errorCode: 'upstream_payload_too_large' }],
  [415, { clientStatus: 415, errorCode: 'upstream_http_415' }],
  [422, { clientStatus: 422, errorCode: 'upstream_http_422' }],
  [429, { clientStatus: 429, errorCode: 'upstream_rate_limited' }],
]);
export function classifyUpstreamStatus(status) {
  return upstreamStatusMap.get(status) || { clientStatus: 502, errorCode: 'upstream_error' };
}
function upstreamUrl(baseUrl, endpoint) {
  const base = baseUrl.replace(/\/$/, '');
  return base.endsWith('/v1') && endpoint.startsWith('/v1/') ? `${base}${endpoint.slice(3)}` : `${base}${endpoint}`;
}

function send(res, status, body, requestId) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  if (requestId) res.setHeader('x-request-id', requestId);
  res.end(JSON.stringify(body));
}

async function bodyOf(req, timeoutMs = 30_000) {
  let size = 0; const chunks = [];
  let timer;
  try {
    const stream = (async () => { for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { code: 'request_body_too_large', statusCode: 413 }); chunks.push(chunk); } })();
    await Promise.race([stream, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Request body timeout'), { code: 'request_timeout', statusCode: 408 })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }); }
}

function keyFrom(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-api-key'];
}

function reasoningEffortOf(input) {
  const candidates = [input?.reasoning_effort, input?.reasoning?.effort, input?.thinking?.effort];
  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length <= 32 ? normalized : undefined;
}

function classifyAddress(raw) {
  const address = String(raw).toLowerCase().replace(/^::ffff:/, '');
  if (net.isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number);
    return { privateNetwork: first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127), linkLocal: first === 169 && second === 254, metadata: address === '169.254.169.254', unspecified: first === 0 };
  }
  return { privateNetwork: address === '::1' || address.startsWith('fc') || address.startsWith('fd'), linkLocal: address.startsWith('fe80:'), metadata: address === 'fd00:ec2::254', unspecified: address === '::' };
}

export async function validateDestination(baseUrl, trustedPrivateNetwork, approvedAddresses = [], lookup = dns.lookup) {
  const value = new URL(baseUrl);
  const records = await lookup(value.hostname, { all: true });
  const currentAddresses = records.map((record) => record.address.toLowerCase()).sort();
  if (!currentAddresses.length || currentAddresses.some((address) => !net.isIP(address))) throw Object.assign(new Error('Invalid upstream DNS result'), { code: 'upstream_error', statusCode: 502 });
  if (approvedAddresses.length && (currentAddresses.length !== approvedAddresses.length || currentAddresses.some((address, index) => address !== approvedAddresses[index]))) throw Object.assign(new Error('Upstream DNS result changed'), { code: 'upstream_error', statusCode: 502 });
  const classes = currentAddresses.map((address) => classifyAddress(address));
  if (classes.some((addressClass) => addressClass.metadata || addressClass.linkLocal || addressClass.unspecified)) throw Object.assign(new Error('Upstream destination is not trusted'), { code: 'upstream_error', statusCode: 502 });
  const hasPrivate = classes.some((addressClass) => addressClass.privateNetwork);
  const hasPublic = classes.some((addressClass) => !addressClass.privateNetwork);
  if (hasPrivate && hasPublic) throw Object.assign(new Error('Mixed public and private upstream addresses are not trusted'), { code: 'upstream_error', statusCode: 502 });
  if (hasPrivate && !trustedPrivateNetwork) throw Object.assign(new Error('Upstream destination is not trusted'), { code: 'upstream_error', statusCode: 502 });
  return currentAddresses;
}

function textParts(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((part) => ['text', 'input_text', 'output_text'].includes(part?.type)).map((part) => part.text || part.input_text || part.output_text || '').join('');
  return '';
}

function normalize(protocol, body) {
  if (body.tool_choice || body.response_format || body.n > 1 || body.logprobs || body.modalities) throw Object.assign(new Error('Unsupported feature'), { code: 'unsupported_feature', statusCode: 400 });
  const tools = (body.tools || []).map((tool) => {
    if (protocol === 'Chat') return { name: tool.function?.name, description: tool.function?.description, parameters: tool.function?.parameters };
    if (protocol === 'Mes') return { name: tool.name, description: tool.description, parameters: tool.input_schema };
    return { name: tool.name, description: tool.description, parameters: tool.parameters };
  });
  if (tools.some((tool) => !tool.name || !tool.parameters)) throw Object.assign(new Error('Unsupported tool definition'), { code: 'unsupported_feature', statusCode: 400 });
  const toolResults = [];
  if (protocol === 'Chat') {
    const system = body.messages?.filter((item) => item.role === 'system').map((item) => textParts(item.content)).join('\n') || undefined;
    const messages = (body.messages || []).filter((item) => item.role !== 'system' && item.role !== 'tool').map((item) => ({ role: item.role, content: textParts(item.content) }));
    for (const item of body.messages || []) if (item.role === 'tool' && item.tool_call_id) toolResults.push({ id: item.tool_call_id, content: textParts(item.content) });
    return { model: body.model, system, messages, maxTokens: body.max_completion_tokens ?? body.max_tokens, tools, toolResults };
  }
  if (protocol === 'Mes') {
    const messages = [];
    for (const item of body.messages || []) {
      const blocks = Array.isArray(item.content) ? item.content : [];
      const results = blocks.filter((block) => block.type === 'tool_result');
      if (results.length) for (const result of results) toolResults.push({ id: result.tool_use_id, content: textParts(result.content) });
      else messages.push({ role: item.role, content: textParts(item.content) });
    }
    return { model: body.model, system: textParts(body.system), messages, maxTokens: body.max_tokens, tools, toolResults };
  }
  const rawInput = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : (body.input || []);
  for (const item of rawInput) if (item.type === 'function_call_output') toolResults.push({ id: item.call_id, content: textParts(item.output) });
  const input = rawInput.filter((item) => item.type !== 'function_call_output').map((item) => ({ role: item.role || 'user', content: textParts(item.content || item) }));
  const system = [body.instructions, ...input.filter((item) => item.role === 'system' || item.role === 'developer').map((item) => item.content)].filter(Boolean).join('\n') || undefined;
  return { model: body.model, system, messages: input.filter((item) => item.role !== 'system' && item.role !== 'developer'), maxTokens: body.max_output_tokens, tools, toolResults };
}

function outboundBody(protocol, normalized, model) {
  if (protocol === 'Chat') return { model, messages: [...(normalized.system ? [{ role: 'system', content: normalized.system }] : []), ...normalized.messages, ...(normalized.toolResults || []).map((result) => ({ role: 'tool', tool_call_id: result.id, content: result.content }))], ...(normalized.tools?.length ? { tools: normalized.tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) } : {}), ...(normalized.maxTokens ? { max_completion_tokens: normalized.maxTokens } : {}) };
  if (protocol === 'Mes') return { model, ...(normalized.system ? { system: normalized.system } : {}), messages: [...normalized.messages, ...(normalized.toolResults?.length ? [{ role: 'user', content: normalized.toolResults.map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: result.content })) }] : [])], ...(normalized.tools?.length ? { tools: normalized.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}), max_tokens: normalized.maxTokens || 1024 };
  return { model, input: [...(normalized.system ? [{ role: 'developer', content: normalized.system }] : []), ...normalized.messages, ...(normalized.toolResults || []).map((result) => ({ type: 'function_call_output', call_id: result.id, output: result.content }))], ...(normalized.tools?.length ? { tools: normalized.tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters })) } : {}), ...(normalized.maxTokens ? { max_output_tokens: normalized.maxTokens } : {}) };
}

function extractText(protocol, body) {
  if (protocol === 'Chat') {
    const message = body.choices?.[0]?.message;
    return textParts(message?.content) || (typeof message?.refusal === 'string' ? message.refusal : '');
  }
  if (protocol === 'Mes') return textParts(body.content);
  const message = body.output?.find((item) => item.type === 'message');
  const content = textParts(message?.content);
  if (content) return content;
  return (message?.content || []).filter((item) => item.type === 'refusal').map((item) => item.refusal || item.text || '').join('');
}

function extractToolCalls(protocol, body) {
  if (protocol === 'Chat') {
    return (body.choices?.[0]?.message?.tool_calls || []).map((call) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}' }));
  }
  if (protocol === 'Mes') {
    return (body.content || []).filter((item) => item.type === 'tool_use').map((call) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.input || {}) }));
  }
  return (body.output || []).filter((item) => item.type === 'function_call').map((call) => ({ id: call.call_id, name: call.name, arguments: call.arguments || '{}' }));
}

function inboundResponse(inboundProtocol, outboundProtocol, body, requestId) {
  const text = extractText(outboundProtocol, body);
  const toolCalls = extractToolCalls(outboundProtocol, body);
  const protocol = inboundProtocol;
  if (toolCalls.length && protocol === 'Chat') return { id: body.id || `chatcmpl_${requestId}`, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: toolCalls.map((toolCall, index) => ({ id: toolCall.id || `call_${requestId}_${index}`, type: 'function', function: { name: toolCall.name, arguments: toolCall.arguments } })) }, finish_reason: 'tool_calls' }], usage: body.usage };
  if (toolCalls.length && protocol === 'Mes') return { id: body.id || `msg_${requestId}`, type: 'message', role: 'assistant', content: toolCalls.map((toolCall, index) => ({ type: 'tool_use', id: toolCall.id || `tool_${requestId}_${index}`, name: toolCall.name, input: JSON.parse(toolCall.arguments) })), stop_reason: 'tool_use', usage: body.usage };
  if (toolCalls.length) return { id: body.id || `resp_${requestId}`, object: 'response', output: toolCalls.map((toolCall, index) => ({ type: 'function_call', call_id: toolCall.id || `call_${requestId}_${index}`, name: toolCall.name, arguments: toolCall.arguments })), status: 'completed', usage: body.usage };
  if (protocol === 'Chat') return { id: body.id || `chatcmpl_${requestId}`, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: body.usage };
  if (protocol === 'Mes') return { id: body.id || `msg_${requestId}`, type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: body.usage };
  return { id: body.id || `resp_${requestId}`, object: 'response', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], status: 'completed', usage: body.usage };
}

function upstreamTimeoutError() {
  return Object.assign(new Error('Upstream timeout'), { code: 'upstream_timeout', statusCode: 504 });
}

async function readBeforeDeadline(reader, deadline, monotonicNow) {
  const remaining = deadline - monotonicNow();
  if (remaining <= 0) throw upstreamTimeoutError();
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(upstreamTimeoutError()), remaining); });
    return await Promise.race([reader.read(), timeout]);
  } finally { clearTimeout(timer); }
}

async function fetchWithTimeout(url, options, addresses, headerTimeoutMs, requestDeadline, signal, onTimeout, monotonicNow) {
  const target = new URL(url);
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortRequest);
    };
    const abortRequest = () => request.destroy(Object.assign(new Error('Gateway request was cancelled'), { code: 'request_aborted', statusCode: 499 }));
    const request = (target.protocol === 'https:' ? https : http).request(target, {
      method: options.method,
      headers: options.headers,
      lookup: (_hostname, lookupOptions, callback) => {
        const record = { address, family: net.isIP(address) };
        if (lookupOptions.all) callback(null, [record]);
        else callback(null, record.address, record.family);
      },
    }, (response) => {
      clearTimeout(timer);
      const status = response.statusCode || 502;
      const headers = new Headers();
      for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
      response.once('end', cleanup);
      response.once('close', cleanup);
      if ([204, 205, 304].includes(status)) { settled = true; response.resume(); return resolve(new Response(null, { status, headers })); }
      settled = true;
      resolve(new Response(Readable.toWeb(response), { status, headers }));
    });
    const remaining = Math.max(0, requestDeadline - monotonicNow());
    timer = setTimeout(() => { timedOut = true; onTimeout?.(); request.destroy(upstreamTimeoutError()); }, Math.min(headerTimeoutMs, remaining));
    request.on('error', (error) => {
      cleanup();
      if (settled) return;
      settled = true;
      reject(timedOut ? upstreamTimeoutError() : error.code === 'request_aborted' ? error : Object.assign(new Error('Upstream unavailable'), { code: 'upstream_error', statusCode: 502 }));
    });
    if (signal?.aborted) abortRequest();
    else signal?.addEventListener('abort', abortRequest, { once: true });
    request.end(options.body);
  });
}

async function readJson(response, deadline, monotonicNow, maxBytes = 4 * 1024 * 1024) {
  let size = 0; let data = '';
  const reader = response.body.getReader();
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream response too large'), { code: 'upstream_error', statusCode: 502 });
      data += Buffer.from(result.value).toString('utf8');
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 }); }
}

async function pipeStream(response, res, metrics, deadline, monotonicNow, maxBytes = 4 * 1024 * 1024) {
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
      metrics.push(result.value);
      res.write(Buffer.from(result.value));
    }
    metrics.finish();
    res.end();
  } finally { await reader.cancel().catch(() => {}); }
}

function streamDelta(protocol, eventName, payload, state = {}) {
  if (payload === '[DONE]') return { done: true, text: '' };
  if (protocol === 'Chat') {
    const toolCalls = payload.choices?.[0]?.delta?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length) { state.sawTool = true; return { done: false, text: '', tools: toolCalls.map((call) => ({ index: call.index ?? 0, id: call.id, callId: call.id, name: call.function?.name, arguments: call.function?.arguments || '' })) }; }
    return { done: false, text: textParts(payload.choices?.[0]?.delta?.content) };
  }
  if (protocol === 'Mes') {
    if (payload.content_block?.type === 'tool_use') {
      const index = Number.isInteger(payload.index) ? payload.index : (state.nextToolIndex || 0);
      state.nextToolIndex = Math.max(state.nextToolIndex || 0, index + 1);
      state.sawTool = true;
      return { done: false, text: '', tools: [{ index, id: payload.content_block.id, callId: payload.content_block.id, name: payload.content_block.name, arguments: '' }] };
    }
    if (payload.delta?.type === 'input_json_delta') {
      const index = Number.isInteger(payload.index) ? payload.index : (state.nextToolIndex ? state.nextToolIndex - 1 : 0);
      state.sawTool = true;
      return { done: false, text: '', tools: [{ index, arguments: payload.delta.partial_json || '' }] };
    }
    return { done: eventName === 'message_stop', text: payload.delta?.type === 'text_delta' ? payload.delta.text || '' : '' };
  }
  if (eventName === 'response.output_item.added' && payload.item?.type === 'function_call') {
    const index = Number.isInteger(payload.output_index) ? payload.output_index : (state.nextToolIndex || 0);
    state.nextToolIndex = Math.max(state.nextToolIndex || 0, index + 1);
    const key = payload.item.id || payload.item.call_id;
    if (key) state.toolIndexes?.set(key, index);
    state.sawTool = true;
    return { done: false, text: '', tools: [{ index, id: payload.item.id, callId: payload.item.call_id, name: payload.item.name, arguments: '' }] };
  }
  if (eventName === 'response.function_call_arguments.delta') {
    const index = Number.isInteger(payload.output_index) ? payload.output_index : (state.toolIndexes?.get(payload.item_id) ?? 0);
    state.sawTool = true;
    return { done: false, text: '', tools: [{ index, arguments: payload.delta || '' }] };
  }
  return { done: eventName === 'response.completed' || eventName === 'response.done', text: typeof payload.delta === 'string' ? payload.delta : '' };
}

function serializedStreamEvent(protocol, text, done, requestId, tool, tools, finishReason = 'stop') {
  if (protocol === 'Chat') {
    if (done) return `data: ${JSON.stringify({ id: `chatcmpl_${requestId}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`;
    if (Array.isArray(tools) && tools.length) return tools.map((item) => `data: ${JSON.stringify({ id: `chatcmpl_${requestId}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: item.index ?? 0, ...(item.id ? { id: item.id, type: 'function' } : {}), function: { ...(item.name ? { name: item.name } : {}), arguments: item.arguments || '' } }] }, finish_reason: null }] })}\n\n`).join('');
    if (tool) return `data: ${JSON.stringify({ id: `chatcmpl_${requestId}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: tool.index ?? 0, ...(tool.id ? { id: tool.id, type: 'function' } : {}), function: { ...(tool.name ? { name: tool.name } : {}), arguments: tool.arguments || '' } }] }, finish_reason: null }] })}\n\n`;
    return `data: ${JSON.stringify({ id: `chatcmpl_${requestId}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`;
  }
  if (protocol === 'Mes') {
    if (Array.isArray(tools) && tools.length) return tools.map((item) => `${item.id || item.name ? `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: item.index ?? 0, content_block: { type: 'tool_use', id: item.id || item.callId || `tool_${requestId}_${item.index ?? 0}`, name: item.name || '', input: {} } })}\n\n` : ''}${item.arguments ? `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: item.index ?? 0, delta: { type: 'input_json_delta', partial_json: item.arguments } })}\n\n` : ''}`).join('');
    return done ? `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n` : `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`;
  }
  if (protocol === 'Res' && Array.isArray(tools) && tools.length) return tools.map((item) => `${item.id || item.name ? `event: response.output_item.added\ndata: ${JSON.stringify({ type: 'response.output_item.added', output_index: item.index ?? 0, item: { type: 'function_call', id: item.id || `fc_${requestId}_${item.index ?? 0}`, call_id: item.callId || item.id || `call_${requestId}_${item.index ?? 0}`, name: item.name || '', arguments: '' } })}\n\n` : ''}${item.arguments ? `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: item.index ?? 0, delta: item.arguments })}\n\n` : ''}`).join('');
  return done ? `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: `resp_${requestId}`, status: 'completed' } })}\n\n` : `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`;
}

async function pipeConvertedStream(response, res, outboundProtocol, inboundProtocol, requestId, metrics, deadline, monotonicNow, maxBytes = 4 * 1024 * 1024) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let size = 0;
  const streamState = { nextToolIndex: 0, toolIndexes: new Map() };
  const writeFrame = (frame) => {
    const lines = frame.split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || '';
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const payload = data === '[DONE]' ? '[DONE]' : JSON.parse(data);
    const delta = streamDelta(outboundProtocol, eventName, payload, streamState);
    if (delta.text || delta.tool || delta.tools || delta.done || payload === '[DONE]') res.write(serializedStreamEvent(inboundProtocol, delta.text, delta.done || payload === '[DONE]', requestId, delta.tool, delta.tools, streamState.sawTool ? 'tool_calls' : 'stop'));
  };
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
      metrics.push(result.value);
      buffer += decoder.decode(result.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) writeFrame(frame);
    }
    if (buffer.trim()) writeFrame(buffer);
    metrics.finish();
    res.end();
  } finally { await reader.cancel().catch(() => {}); }
}

async function appendUsage(store, record) {
  try {
    await store.update((value) => {
      const configured = Number(value.settings?.usageRetentionCount);
      const retention = Number.isInteger(configured) ? Math.min(Math.max(configured, 1), 100_000) : 1000;
      return { ...value, usage: [...(value.usage || []), record].slice(-retention) };
    });
  } catch {}
}

export function createGatewayServer({ store, vault, rateLimitPerMinute = 60, maxConcurrentRequests = 32, upstreamHeaderTimeoutMs = 300_000, maxRequestDurationMs = 600_000, routeTestTimeoutMs = 610_000, dnsLookup = dns.lookup, now = Date.now, monotonicNow = () => performance.now() } = {}) {
  if (!store || !vault) throw new Error('Gateway server requires store and vault');
  const rateBuckets = new Map();
  const healthByRoute = new Map();
  const routeTestCredentials = new Map();
  const routeTestCalls = [];
  let inFlight = 0;
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const startedAt = now();
    const requestStartedMonotonic = monotonicNow();
    const requestDeadline = requestStartedMonotonic + maxRequestDurationMs;
    const requestController = new AbortController();
    res.once('close', () => { if (!res.writableEnded) requestController.abort(); });
    let upstreamTimedOut = false;
    let metrics;
    let inbound;
    let route;
    let upstream;
    let targetHealth;
    let requestGeneration;
    let reasoningEffort;
    let upstreamStarted = false;
    let outcomeRecorded = false;
    let hasFallback = false;
    let acquiredSlot = false;
    function recordOutcome(failed) {
      if (!targetHealth || outcomeRecorded || targetHealth.generation !== requestGeneration) return;
      outcomeRecorded = true;
      if (!failed || !hasFallback) { targetHealth.failures = 0; return; }
      targetHealth.failures += 1;
      if (targetHealth.failures >= targetHealth.threshold) {
        targetHealth.failures = 0;
        targetHealth.openUntil = now() + targetHealth.cooldownSeconds * 1000;
        targetHealth.generation += 1;
      }
    }
    try {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok', service: 'gateway' }, requestId);
      if (req.method === 'GET' && new URL(req.url, 'http://127.0.0.1').pathname === '/v1/models') {
        const apiKey = keyFrom(req);
        const config = await store.read();
        const keyHash = apiKey && crypto.createHash('sha256').update(apiKey).digest('hex');
        const modelCredential = config.clientKeys.find((item) => item.enabled && item.keyHash === keyHash);
        if (!modelCredential) return send(res, 401, { error: 'unauthorized', requestId }, requestId);
        const routes = config.routes.filter((item) => item.enabled && (!modelCredential.scope?.length || modelCredential.scope.includes(item.alias)));
        return send(res, 200, { object: 'list', data: routes.map((route) => ({ id: route.alias, object: 'model', owned_by: 'cx-routing-gateway', created: Math.floor(Date.parse(route.createdAt || new Date().toISOString()) / 1000) })) }, requestId);
      }
      if (inFlight >= maxConcurrentRequests) return send(res, 429, { error: 'concurrency_limited', requestId }, requestId);
      inFlight += 1;
      acquiredSlot = true;
      inbound = pathProtocols[new URL(req.url, 'http://127.0.0.1').pathname];
      if (req.method !== 'POST' || !inbound) return send(res, 404, { error: 'not_found', requestId }, requestId);
      const apiKey = keyFrom(req);
      const config = await store.read();
      const keyHash = apiKey && crypto.createHash('sha256').update(apiKey).digest('hex');
      const persistedCredential = keyHash && config.clientKeys.find((item) => item.enabled && item.keyHash === keyHash);
      const temporaryCredential = keyHash && routeTestCredentials.get(keyHash);
      const credential = persistedCredential || (temporaryCredential?.expiresAt > now() ? temporaryCredential : undefined);
      if (!credential) return send(res, 401, { error: 'unauthorized', requestId }, requestId);
      const timestamp = Date.now();
      const recent = (rateBuckets.get(keyHash) || []).filter((entry) => timestamp - entry < 60_000);
      if (recent.length >= rateLimitPerMinute) return send(res, 429, { error: 'rate_limited', requestId }, requestId);
      recent.push(timestamp); rateBuckets.set(keyHash, recent);
      const input = await bodyOf(req);
      reasoningEffort = reasoningEffortOf(input);
      route = config.routes.find((item) => item.enabled && item.alias === input.model && item.inboundProtocol === inbound);
      if (!route) return send(res, 404, { error: 'route_not_found', requestId }, requestId);
      if (credential.routeId && credential.routeId !== route.id) return send(res, 403, { error: 'forbidden', requestId }, requestId);
      if (Array.isArray(credential.scope) && credential.scope.length && !credential.scope.includes(route.alias)) return send(res, 403, { error: 'forbidden', requestId }, requestId);
      const availableTargets = (route.targets?.length ? route.targets : [{ upstreamId: route.upstreamId, modelId: route.modelId }]).map(target => ({ target, upstream: config.upstreams.find(item => item.enabled && item.id === target.upstreamId) })).filter(item => item.upstream);
      if (!availableTargets.length) return send(res, 502, { error: 'upstream_error', requestId }, requestId);
      hasFallback = availableTargets.length > 1;
      const policy = { failureThreshold: route.failover?.failureThreshold ?? 3, statusClasses: route.failover?.statusClasses ?? [4, 5], cooldownSeconds: route.failover?.cooldownSeconds ?? 60 };
      const signature = JSON.stringify({ targets: route.targets ?? [{ upstreamId: route.upstreamId, modelId: route.modelId }], policy });
      let health = healthByRoute.get(route.id);
      if (!health || health.signature !== signature) { health = { signature, targets: new Map() }; healthByRoute.set(route.id, health); }
      const selected = availableTargets.find(item => {
        const key = JSON.stringify([item.target.upstreamId, item.target.modelId]);
        if (!health.targets.has(key)) health.targets.set(key, { failures: 0, openUntil: 0, generation: 0, threshold: policy.failureThreshold, cooldownSeconds: policy.cooldownSeconds });
        item.health = health.targets.get(key);
        return item.health.openUntil <= now();
      });
      if (!selected) return send(res, 503, { error: 'all_upstreams_unavailable', requestId }, requestId);
      targetHealth = selected.health;
      requestGeneration = targetHealth.generation;
      upstream = selected.upstream;
      route = { ...route, upstreamId: selected.target.upstreamId, modelId: selected.target.modelId };
      metrics = createRequestMetrics({ protocol: route.outboundProtocol, stream: input.stream === true, startedAt: requestStartedMonotonic, clock: monotonicNow });
      const normalized = route.outboundProtocol === inbound ? null : normalize(inbound, input);
      upstreamStarted = true;
      const addresses = await validateDestination(upstream.baseUrl, upstream.trustedPrivateNetwork === true, upstream.approvedAddresses || [], dnsLookup);
      const outboundPath = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' }[route.outboundProtocol];
      const headers = { 'content-type': 'application/json', 'x-request-id': requestId };
      const secret = upstream.credentialRef ? await vault.get(upstream.credentialRef) : undefined;
      if (secret) headers[route.outboundProtocol === 'Mes' ? 'x-api-key' : 'authorization'] = route.outboundProtocol === 'Mes' ? secret : `Bearer ${secret}`;
      if (route.outboundProtocol === 'Mes') headers['anthropic-version'] = '2026-10-21';
      const payload = route.outboundProtocol === inbound ? { ...input, model: route.modelId } : outboundBody(route.outboundProtocol, normalized, route.modelId);
      if (input.stream === true) {
        payload.stream = true;
        if (route.outboundProtocol === 'Chat') payload.stream_options = { ...payload.stream_options, include_usage: true };
      }
      const serializedPayload = JSON.stringify(payload);
      headers['content-length'] = String(Buffer.byteLength(serializedPayload, 'utf8'));
      const upstreamResponse = await fetchWithTimeout(upstreamUrl(upstream.baseUrl, outboundPath), { method: 'POST', headers, body: serializedPayload }, addresses, upstreamHeaderTimeoutMs, requestDeadline, requestController.signal, () => { upstreamTimedOut = true; }, monotonicNow);
      if (upstreamResponse.status >= 300) {
        await upstreamResponse.body?.cancel().catch(() => {});
        recordOutcome(policy.statusClasses.includes(Math.floor(upstreamResponse.status / 100)));
        const classified = classifyUpstreamStatus(upstreamResponse.status);
        await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'failed', errorCode: classified.errorCode, upstreamStatus: upstreamResponse.status, gatewayStatus: classified.clientStatus });
        return send(res, classified.clientStatus, { error: classified.errorCode, requestId }, requestId);
      }
      if (input.stream === true) {
        res.statusCode = upstreamResponse.status;
        res.setHeader('content-type', upstreamResponse.headers.get('content-type') || 'text/event-stream');
        res.setHeader('x-request-id', requestId);
        if (route.outboundProtocol === inbound) await pipeStream(upstreamResponse, res, metrics, requestDeadline, monotonicNow);
        else await pipeConvertedStream(upstreamResponse, res, route.outboundProtocol, inbound, requestId, metrics, requestDeadline, monotonicNow);
        recordOutcome(false);
        await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), httpStatus: upstreamResponse.status, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'completed' });
        if (!credential.temporary) await store.update((value) => ({ ...value, clientKeys: value.clientKeys.map((item) => item.id === credential.id ? { ...item, lastUsedAt: new Date().toISOString() } : item) }));
        return;
      }
      const upstreamBody = await readJson(upstreamResponse, requestDeadline, monotonicNow);
      metrics.observeJson(upstreamBody);
      recordOutcome(false);
      await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), httpStatus: upstreamResponse.status, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'completed' });
      if (!credential.temporary) await store.update((value) => ({ ...value, clientKeys: value.clientKeys.map((item) => item.id === credential.id ? { ...item, lastUsedAt: new Date().toISOString() } : item) }));
      return send(res, 200, route.outboundProtocol === inbound ? upstreamBody : inboundResponse(inbound, route.outboundProtocol, upstreamBody, requestId), requestId);
    } catch (error) {
      if (upstreamTimedOut) error = Object.assign(new Error('Upstream timeout'), { code: 'upstream_timeout', statusCode: 504 });
      if (upstreamStarted && (error.code === 'upstream_error' || error.code === 'upstream_timeout' || !error.statusCode)) recordOutcome(true);
      if (route && upstream) await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), ...(error.statusCode ? { gatewayStatus: error.statusCode } : {}), inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: error.statusCode === 400 ? 'rejected' : 'failed', errorCode: error.code || 'gateway_error' });
      if (requestController.signal.aborted || res.destroyed) return;
      if (res.headersSent) return res.destroy();
      return send(res, error.statusCode || 500, { error: error.code || 'internal_error', message: error.statusCode ? error.message : undefined, requestId }, requestId);
    } finally {
      if (acquiredSlot) inFlight -= 1;
    }
  });
  server.testRoute = async (routeId, prompt) => {
    if (typeof routeId !== 'string' || !routeId || routeId.length > 100) throw new Error('无效的路由');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('测试内容需为 1 至 2000 个字符');
    const config = await store.read();
    const route = config.routes.find((item) => item.id === routeId && item.enabled);
    if (!route) throw new Error('路由不存在或已停用');
    const timestamp = now();
    while (routeTestCalls.length && timestamp - routeTestCalls[0] >= 60_000) routeTestCalls.shift();
    if (routeTestCalls.length >= 10) throw new Error('真实路由测试每分钟最多 10 次');
    routeTestCalls.push(timestamp);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Gateway 尚未启动');

    const key = `cxrg_test_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    routeTestCredentials.set(keyHash, { id: `route-test-${crypto.randomUUID()}`, name: '临时路由测试', scope: [route.alias], routeId: route.id, enabled: true, temporary: true, expiresAt: timestamp + 60_000 });
    const endpoint = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' }[route.inboundProtocol];
    const text = prompt.trim();
    const body = route.inboundProtocol === 'Res'
      ? { model: route.alias, input: text, max_output_tokens: 256 }
      : route.inboundProtocol === 'Mes'
        ? { model: route.alias, max_tokens: 256, messages: [{ role: 'user', content: text }] }
        : { model: route.alias, max_completion_tokens: 256, messages: [{ role: 'user', content: text }] };
    const startedAt = monotonicNow();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(routeTestTimeoutMs),
      });
      const requestId = response.headers.get('x-request-id') || '';
      const result = await response.json().catch(() => ({}));
      const durationMs = Math.max(0, monotonicNow() - startedAt);
      if (!response.ok) {
        const errors = { all_upstreams_unavailable: '所有上游当前均不可用', upstream_error: '上游请求失败，请检查上游状态和日志', upstream_rate_limited: '上游请求被限流，请稍后重试', upstream_payload_too_large: '上游拒绝了过大的请求体', request_body_too_large: '请求体超过网关限制', upstream_timeout: '上游响应超时', unsupported_feature: '当前请求包含不支持的协议特性', route_not_found: '路由未匹配到此请求协议' };
        return { routeAlias: route.alias, text: '', requestId, durationMs, status: response.status, error: errors[result.error] || `Gateway 请求失败（${response.status}）` };
      }
      const resultText = extractText(route.inboundProtocol, result);
      return { routeAlias: route.alias, text: typeof resultText === 'string' ? resultText : '', requestId, durationMs, status: response.status };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new Error('测试请求超时');
      throw error;
    } finally {
      routeTestCredentials.delete(keyHash);
      rateBuckets.delete(keyHash);
    }
  };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.CXRG_DATA_DIR || './.cxrg-data';
  const { ConfigStore } = await import('../../../packages/shared/src/config-store.mjs');
  const { SecretVault } = await import('../../../packages/shared/src/secret-vault.mjs');
  const server = createGatewayServer({ store: new ConfigStore(`${dataDir}/config.json`), vault: new SecretVault(`${dataDir}/secrets.json`) });
  server.listen(Number(process.env.CXRG_GATEWAY_PORT || 4318), '127.0.0.1');
  process.stdin.on('end', () => server.close(() => process.exit(0)));
  process.stdin.resume();
}
