import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BODY = 1024 * 1024;
const pathProtocols = { '/v1/responses': 'Res', '/v1/messages': 'Mes', '/v1/chat/completions': 'Chat' };
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
  let size = 0; let data = '';
  let timer;
  try {
    const stream = (async () => { for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { statusCode: 413 }); data += chunk; } })();
    await Promise.race([stream, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Request body timeout'), { code: 'request_timeout', statusCode: 408 })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }); }
}

function keyFrom(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-api-key'];
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
  if (approvedAddresses.length && (currentAddresses.length !== approvedAddresses.length || currentAddresses.some((address, index) => address !== approvedAddresses[index]))) throw Object.assign(new Error('Upstream DNS result changed'), { code: 'upstream_error', statusCode: 502 });
  const classes = currentAddresses.map((address) => classifyAddress(address));
  if (classes.some((addressClass) => addressClass.metadata || addressClass.linkLocal || addressClass.unspecified)) throw Object.assign(new Error('Upstream destination is not trusted'), { code: 'upstream_error', statusCode: 502 });
  const hasPrivate = classes.some((addressClass) => addressClass.privateNetwork);
  const hasPublic = classes.some((addressClass) => !addressClass.privateNetwork);
  if (hasPrivate && hasPublic) throw Object.assign(new Error('Mixed public and private upstream addresses are not trusted'), { code: 'upstream_error', statusCode: 502 });
  if (hasPrivate && !trustedPrivateNetwork) throw Object.assign(new Error('Upstream destination is not trusted'), { code: 'upstream_error', statusCode: 502 });
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
  if (protocol === 'Chat') return textParts(body.choices?.[0]?.message?.content);
  if (protocol === 'Mes') return textParts(body.content);
  const message = body.output?.find((item) => item.type === 'message');
  return textParts(message?.content);
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

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' }); } catch (error) { throw Object.assign(new Error(error.name === 'AbortError' ? 'Upstream timeout' : 'Upstream unavailable'), { code: error.name === 'AbortError' ? 'upstream_timeout' : 'upstream_error', statusCode: error.name === 'AbortError' ? 504 : 502 }); } finally { clearTimeout(timer); }
}

async function readJson(response, maxBytes = 4 * 1024 * 1024) {
  let size = 0; let data = '';
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Upstream response too large'), { code: 'upstream_error', statusCode: 502 });
    data += Buffer.from(chunk).toString('utf8');
  }
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 }); }
}

async function pipeStream(response, res, maxBytes = 4 * 1024 * 1024, maxDurationMs = 120_000) {
  const reader = response.body.getReader();
  const deadline = Date.now() + maxDurationMs;
  let size = 0;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Object.assign(new Error('Upstream stream timeout'), { code: 'upstream_timeout', statusCode: 504 });
      let timer;
      try {
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Upstream stream timeout'), { code: 'upstream_timeout', statusCode: 504 })), remaining); });
        const result = await Promise.race([reader.read(), timeout]);
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
        res.write(Buffer.from(result.value));
      } finally { clearTimeout(timer); }
    }
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

async function pipeConvertedStream(response, res, outboundProtocol, inboundProtocol, requestId, maxBytes = 4 * 1024 * 1024, maxDurationMs = 120_000) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + maxDurationMs;
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
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Object.assign(new Error('Upstream stream timeout'), { code: 'upstream_timeout', statusCode: 504 });
      let timer;
      try {
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Upstream stream timeout'), { code: 'upstream_timeout', statusCode: 504 })), remaining); });
        const result = await Promise.race([reader.read(), timeout]);
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
        buffer += decoder.decode(result.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) writeFrame(frame);
      } finally { clearTimeout(timer); }
    }
    if (buffer.trim()) writeFrame(buffer);
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

export function createGatewayServer({ store, vault, rateLimitPerMinute = 60, maxConcurrentRequests = 32, dnsLookup = dns.lookup, now = Date.now } = {}) {
  if (!store || !vault) throw new Error('Gateway server requires store and vault');
  const rateBuckets = new Map();
  const healthByRoute = new Map();
  let inFlight = 0;
  return http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let inbound;
    let route;
    let upstream;
    let targetHealth;
    let requestGeneration;
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
      const credential = keyHash && config.clientKeys.find((item) => item.enabled && item.keyHash === keyHash);
      if (!credential) return send(res, 401, { error: 'unauthorized', requestId }, requestId);
      const timestamp = Date.now();
      const recent = (rateBuckets.get(keyHash) || []).filter((entry) => timestamp - entry < 60_000);
      if (recent.length >= rateLimitPerMinute) return send(res, 429, { error: 'rate_limited', requestId }, requestId);
      recent.push(timestamp); rateBuckets.set(keyHash, recent);
      const input = await bodyOf(req);
      route = config.routes.find((item) => item.enabled && item.alias === input.model && item.inboundProtocol === inbound);
      if (!route) return send(res, 404, { error: 'route_not_found', requestId }, requestId);
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
      const normalized = route.outboundProtocol === inbound ? null : normalize(inbound, input);
      upstreamStarted = true;
      await validateDestination(upstream.baseUrl, upstream.trustedPrivateNetwork === true, upstream.approvedAddresses || [], dnsLookup);
      const outboundPath = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' }[route.outboundProtocol];
      const headers = { 'content-type': 'application/json', 'x-request-id': requestId };
      const secret = upstream.credentialRef ? await vault.get(upstream.credentialRef) : undefined;
      if (secret) headers[route.outboundProtocol === 'Mes' ? 'x-api-key' : 'authorization'] = route.outboundProtocol === 'Mes' ? secret : `Bearer ${secret}`;
      if (route.outboundProtocol === 'Mes') headers['anthropic-version'] = '2026-10-21';
      const payload = route.outboundProtocol === inbound ? { ...input, model: route.modelId } : outboundBody(route.outboundProtocol, normalized, route.modelId);
      const upstreamResponse = await fetchWithTimeout(upstreamUrl(upstream.baseUrl, outboundPath), { method: 'POST', headers, body: JSON.stringify(payload) });
      if (upstreamResponse.status >= 300) {
        recordOutcome(policy.statusClasses.includes(Math.floor(upstreamResponse.status / 100)));
        await appendUsage(store, { requestId, createdAt: new Date().toISOString(), durationMs: Date.now() - startedAt, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, modelId: route.modelId, status: 'failed', errorCode: 'upstream_error', upstreamStatus: upstreamResponse.status });
        return send(res, 502, { error: 'upstream_error', requestId }, requestId);
      }
      if (input.stream === true) {
        res.statusCode = upstreamResponse.status;
        res.setHeader('content-type', upstreamResponse.headers.get('content-type') || 'text/event-stream');
        res.setHeader('x-request-id', requestId);
        if (route.outboundProtocol === inbound) await pipeStream(upstreamResponse, res);
        else await pipeConvertedStream(upstreamResponse, res, route.outboundProtocol, inbound, requestId);
        recordOutcome(false);
        await appendUsage(store, { requestId, createdAt: new Date().toISOString(), durationMs: Date.now() - startedAt, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, modelId: route.modelId, status: 'completed' });
        await store.update((value) => ({ ...value, clientKeys: value.clientKeys.map((item) => item.id === credential.id ? { ...item, lastUsedAt: new Date().toISOString() } : item) }));
        return;
      }
      const upstreamBody = await readJson(upstreamResponse);
      recordOutcome(false);
      await appendUsage(store, { requestId, createdAt: new Date().toISOString(), durationMs: Date.now() - startedAt, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, modelId: route.modelId, status: 'completed' });
      await store.update((value) => ({ ...value, clientKeys: value.clientKeys.map((item) => item.id === credential.id ? { ...item, lastUsedAt: new Date().toISOString() } : item) }));
      return send(res, 200, route.outboundProtocol === inbound ? upstreamBody : inboundResponse(inbound, route.outboundProtocol, upstreamBody, requestId), requestId);
    } catch (error) {
      if (upstreamStarted && (error.code === 'upstream_error' || error.code === 'upstream_timeout' || !error.statusCode)) recordOutcome(true);
      if (route && upstream) await appendUsage(store, { requestId, createdAt: new Date().toISOString(), durationMs: Date.now() - startedAt, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, modelId: route.modelId, status: error.statusCode === 400 ? 'rejected' : 'failed', errorCode: error.code || 'gateway_error' });
      if (res.headersSent) return res.destroy();
      return send(res, error.statusCode || 500, { error: error.code || 'internal_error', message: error.statusCode ? error.message : undefined, requestId }, requestId);
    } finally {
      if (acquiredSlot) inFlight -= 1;
    }
  });
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
