// Observe only bounded, numeric metadata. Never retain response bodies in a log.
const MAX_FRAME = 256 * 1024;
const count = value => Number.isSafeInteger(value) && value >= 0;
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

export function createRequestMetrics({ protocol, stream, startedAt, clock = Date.now }) {
  const tokens = {};
  let firstTokenMs;
  let reportedTotal;
  let buffer = '';
  let discarding = false;
  const decoder = new TextDecoder();
  const put = (name, value) => {
    if (!count(value)) return;
    const affectsTotal = name === 'input' || name === 'output' || (protocol === 'Mes' && ['cacheRead', 'cacheWrite'].includes(name));
    if (affectsTotal && tokens[name] !== value) reportedTotal = undefined;
    tokens[name] = value;
  };
  function observeUsage(usage) {
    if (!usage || typeof usage !== 'object') return;
    const chat = protocol === 'Chat';
    put('input', chat ? usage.prompt_tokens : usage.input_tokens);
    put('output', chat ? usage.completion_tokens : usage.output_tokens);
    const inputDetails = chat ? usage.prompt_tokens_details : usage.input_tokens_details;
    const outputDetails = chat ? usage.completion_tokens_details : usage.output_tokens_details;
    put('cacheRead', protocol === 'Mes' ? usage.cache_read_input_tokens : inputDetails?.cached_tokens);
    put('cacheWrite', usage.cache_creation_input_tokens);
    put('cacheWrite5m', usage.cache_creation?.ephemeral_5m_input_tokens);
    put('cacheWrite1h', usage.cache_creation?.ephemeral_1h_input_tokens);
    put('reasoning', outputDetails?.reasoning_tokens);
    put('inputAudio', inputDetails?.audio_tokens);
    put('outputAudio', outputDetails?.audio_tokens);
    if (count(usage.total_tokens)) reportedTotal = usage.total_tokens;
  }
  function observeFrame(frame) {
    const lines = frame.split(/\r?\n/);
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    try {
      const payload = JSON.parse(data);
      if (!payload || typeof payload !== 'object') return;
      const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || payload.type;
      observeUsage(payload.usage ?? payload.message?.usage ?? payload.response?.usage);
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
  return {
    observeJson(body) { observeUsage(body?.usage); },
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
      return { stream, ...(firstTokenMs === undefined ? {} : { firstTokenMs }), ...(Object.keys(result).length ? { tokens: result } : {}) };
    },
  };
}
