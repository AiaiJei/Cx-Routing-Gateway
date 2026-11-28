import { performance } from 'node:perf_hooks';

// Observe only bounded, numeric metadata. Never retain response bodies in a log.
const MAX_FRAME = 256 * 1024;
const count = value => Number.isSafeInteger(value) && value >= 0;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const nonempty = value => typeof value === 'string' && value.length > 0;
const textContent = value => nonempty(value) || (Array.isArray(value) && value.some(part => nonempty(part?.text)));

function hasGeneration(protocol, event, payload) {
  if (protocol === 'Chat') return payload.choices?.some(choice => {
    const delta = choice?.delta;
    return delta && (textContent(delta.content) || nonempty(delta.refusal) || nonempty(delta.reasoning_content) || nonempty(delta.reasoning) || delta.tool_calls?.some(call => nonempty(call?.function?.name) || nonempty(call?.function?.arguments)));
  });
  if (protocol === 'Mes') {
    const delta = payload.delta;
    const block = payload.content_block;
    return (event === 'content_block_delta' && ['text_delta', 'thinking_delta', 'input_json_delta'].includes(delta?.type) && (nonempty(delta.text) || nonempty(delta.thinking) || nonempty(delta.partial_json))) ||
      (event === 'content_block_start' && block && (nonempty(block.text) || nonempty(block.thinking) || (block.type === 'tool_use' && nonempty(block.name))));
  }
  return (['response.output_text.delta', 'response.refusal.delta', 'response.reasoning_text.delta', 'response.reasoning_summary_text.delta', 'response.function_call_arguments.delta'].includes(event) && nonempty(payload.delta)) ||
    (event === 'response.output_item.added' && payload.item?.type === 'function_call' && nonempty(payload.item.name));
}

export function createRequestMetrics({ protocol, stream, startedAt, clock = () => performance.now() }) {
  const tokens = {};
  const usageSources = new Set();
  const validUsageFields = new Set();
  const validCoreFields = new Set();
  const invalidUsageFields = new Set();
  const requiredUsageFields = protocol === 'Chat' ? ['prompt_tokens', 'completion_tokens'] : ['input_tokens', 'output_tokens'];
  let usageObjectSeen = false;
  let firstTokenMs;
  let upstreamHeadersMs;
  let upstreamFirstByteMs;
  let upstreamBodyStartedAt;
  let upstreamBodyMs;
  let upstreamChunkCount;
  let gatewayProcessingMs;
  let reportedTotal;
  let buffer = '';
  let discarding = false;
  const decoder = new TextDecoder();
  const elapsed = value => Number.isFinite(value) && value >= 0 ? value : undefined;
  const put = (name, value) => {
    if (!count(value)) return;
    if (name === 'total') { reportedTotal = value; return; }
    const affectsTotal = name === 'input' || name === 'output' || (protocol === 'Mes' && ['cacheRead', 'cacheWrite'].includes(name));
    if (affectsTotal && tokens[name] !== value) reportedTotal = undefined;
    tokens[name] = value;
  };
  function observeUsageValue(field, value, name, core = false) {
    if (count(value)) {
      validUsageFields.add(field);
      invalidUsageFields.delete(field);
      if (core) validCoreFields.add(field);
      put(name, value);
      return;
    }
    validUsageFields.delete(field);
    invalidUsageFields.add(field);
    delete tokens[name];
    if (core || name === 'total' || (protocol === 'Mes' && ['cacheRead', 'cacheWrite'].includes(name))) reportedTotal = undefined;
    if (core) validCoreFields.delete(field);
  }
  function observeNestedUsageValue(usage, parent, child, name) {
    if (!hasOwn(usage, parent)) return;
    const detail = usage[parent];
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      invalidUsageFields.add(parent);
      validUsageFields.delete(`${parent}.${child}`);
      delete tokens[name];
      if (protocol === 'Mes' && ['cacheRead', 'cacheWrite'].includes(name)) reportedTotal = undefined;
      return;
    }
    invalidUsageFields.delete(parent);
    if (hasOwn(detail, child)) observeUsageValue(`${parent}.${child}`, detail[child], name);
  }
  function observeUsage(usage, source) {
    if (usage === undefined || usage === null) return;
    usageObjectSeen = true;
    usageSources.add(source);
    if (typeof usage !== 'object' || Array.isArray(usage)) {
      invalidUsageFields.add('usage');
      validUsageFields.clear();
      validCoreFields.clear();
      for (const name of Object.keys(tokens)) delete tokens[name];
      reportedTotal = undefined;
      return;
    }
    invalidUsageFields.delete('usage');
    const chat = protocol === 'Chat';
    const inputField = chat ? 'prompt_tokens' : 'input_tokens';
    const outputField = chat ? 'completion_tokens' : 'output_tokens';
    if (hasOwn(usage, inputField)) observeUsageValue(inputField, usage[inputField], 'input', true);
    if (hasOwn(usage, outputField)) observeUsageValue(outputField, usage[outputField], 'output', true);
    if (protocol === 'Mes' && hasOwn(usage, 'cache_read_input_tokens')) observeUsageValue('cache_read_input_tokens', usage.cache_read_input_tokens, 'cacheRead');
    else observeNestedUsageValue(usage, chat ? 'prompt_tokens_details' : 'input_tokens_details', 'cached_tokens', 'cacheRead');
    if (hasOwn(usage, 'cache_creation_input_tokens')) observeUsageValue('cache_creation_input_tokens', usage.cache_creation_input_tokens, 'cacheWrite');
    observeNestedUsageValue(usage, 'cache_creation', 'ephemeral_5m_input_tokens', 'cacheWrite5m');
    observeNestedUsageValue(usage, 'cache_creation', 'ephemeral_1h_input_tokens', 'cacheWrite1h');
    observeNestedUsageValue(usage, chat ? 'completion_tokens_details' : 'output_tokens_details', 'reasoning_tokens', 'reasoning');
    observeNestedUsageValue(usage, chat ? 'prompt_tokens_details' : 'input_tokens_details', 'audio_tokens', 'inputAudio');
    observeNestedUsageValue(usage, chat ? 'completion_tokens_details' : 'output_tokens_details', 'audio_tokens', 'outputAudio');
    if (hasOwn(usage, 'total_tokens')) observeUsageValue('total_tokens', usage.total_tokens, 'total');
  }
  function observeUsageCandidates(payload) {
    for (const [source, usage] of [['usage', payload?.usage], ['message.usage', payload?.message?.usage], ['response.usage', payload?.response?.usage]]) {
      observeUsage(usage, source);
    }
  }
  function usageDiagnostic() {
    const missingFields = requiredUsageFields.filter(field => !validCoreFields.has(field));
    const status = !usageObjectSeen ? 'missing' : missingFields.length === 0 ? 'reported' : validUsageFields.size > 0 ? 'partial' : 'invalid';
    return { status, sources: [...usageSources], missingFields, invalidFields: [...invalidUsageFields] };
  }
  function observeFrame(frame) {
    const lines = frame.split(/\r?\n/);
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    try {
      const payload = JSON.parse(data);
      if (!payload || typeof payload !== 'object') return;
      const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || payload.type;
      observeUsageCandidates(payload);
      if (firstTokenMs === undefined && hasGeneration(protocol, event, payload)) firstTokenMs = Math.max(0, clock() - startedAt);
    } catch { /* Observability must not alter passthrough behavior. */ }
  }
  function consume(text) {
    for (let offset = 0; offset < text.length; offset += 8192) {
      buffer += text.slice(offset, offset + 8192);
      let delimiter;
      while ((delimiter = /\r?\n\r?\n/.exec(buffer))) {
        if (!discarding && delimiter.index <= MAX_FRAME) observeFrame(buffer.slice(0, delimiter.index));
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        discarding = false;
      }
      if (buffer.length > MAX_FRAME) { buffer = buffer.slice(-3); discarding = true; }
    }
  }
  function measureProcessing(work) {
    if (!stream) return work();
    const before = clock();
    try { return work(); }
    finally {
      const duration = elapsed(clock() - before);
      if (duration !== undefined) {
        const total = (gatewayProcessingMs ?? 0) + duration;
        if (Number.isFinite(total)) gatewayProcessingMs = total;
      }
    }
  }
  return {
    observeJson(body) { observeUsageCandidates(body); },
    usageDiagnostic,
    markUpstreamHeaders() {
      if (!stream || upstreamHeadersMs !== undefined) return;
      upstreamHeadersMs = elapsed(clock() - startedAt);
      upstreamChunkCount = 0;
      gatewayProcessingMs = 0;
    },
    observeUpstreamChunk(chunk) {
      const byteLength = chunk?.byteLength ?? chunk?.length;
      if (!stream || !Number.isSafeInteger(byteLength) || byteLength <= 0) return;
      if (upstreamChunkCount !== undefined && upstreamChunkCount < Number.MAX_SAFE_INTEGER) upstreamChunkCount += 1;
      if (upstreamFirstByteMs === undefined) {
        const at = clock();
        const duration = elapsed(at - startedAt);
        if (duration !== undefined) {
          upstreamFirstByteMs = duration;
          upstreamBodyStartedAt = at;
        }
      }
    },
    endUpstreamBody() {
      if (!stream || upstreamBodyStartedAt === undefined || upstreamBodyMs !== undefined) return;
      upstreamBodyMs = elapsed(clock() - upstreamBodyStartedAt);
    },
    measureProcessing,
    push(chunk) { if (stream) consume(decoder.decode(chunk, { stream: true })); },
    finish() {
      if (!stream) return;
      consume(decoder.decode());
      if (!discarding && buffer.trim()) observeFrame(buffer);
      buffer = '';
    },
    snapshot() {
      const result = { ...tokens };
      const knownCache = protocol !== 'Mes' || (count(tokens.cacheRead) && count(tokens.cacheWrite));
      const derivedTotal = knownCache && count(tokens.input) && count(tokens.output)
        ? tokens.input + tokens.output + (protocol === 'Mes' ? (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0) : 0)
        : undefined;
      const total = reportedTotal ?? derivedTotal;
      if (count(total)) result.total = total;
      return {
        stream,
        ...(firstTokenMs === undefined ? {} : { firstTokenMs }),
        ...(upstreamHeadersMs === undefined ? {} : { upstreamHeadersMs }),
        ...(upstreamFirstByteMs === undefined ? {} : { upstreamFirstByteMs }),
        ...(upstreamBodyMs === undefined ? {} : { upstreamBodyMs }),
        ...(upstreamChunkCount === undefined ? {} : { upstreamChunkCount }),
        ...(gatewayProcessingMs === undefined ? {} : { gatewayProcessingMs }),
        ...(Object.keys(result).length ? { tokens: result } : {}),
      };
    },
  };
}
