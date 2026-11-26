import { validateCapabilities, supportedEfforts, LEVELS, invalid } from '../../../packages/shared/src/model-capabilities.cjs';

const effortOf = (body, protocol) => protocol === 'Res' ? body.reasoning?.effort : protocol === 'Mes' ? body.output_config?.effort : body.reasoning_effort;
function hasTools(input) {
  if (input.tools?.length || input.functions?.length || input.additional_tools?.tools?.length) return true;
  if (Array.isArray(input.input) && input.input.some(item => ['additional_tools', 'function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output', 'tool_search_call', 'tool_search_output'].includes(item?.type))) return true;
  return Array.isArray(input.messages) && input.messages.some(item => item?.role === 'tool' || item?.role === 'function' || item?.tool_calls?.length || item?.function_call || (Array.isArray(item?.content) && item.content.some(part => ['tool_use','tool_result'].includes(part?.type))));
}
function hasImage(body, protocol) {
  const messages = protocol === 'Res' ? body.input : body.messages;
  if (!Array.isArray(messages)) return false;
  const pending = messages.flatMap(item => [item?.content, item?.output]);
  while (pending.length) {
    const content = pending.pop();
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (['input_image', 'image_url', 'image'].includes(part?.type)) return true;
      if (part?.type === 'tool_result') pending.push(part.content);
    }
  }
  return false;
}

/** Apply explicit model facts to the wire request; absent facts preserve legacy behavior. */
export function applyModelCapabilities(input, protocol, capabilities, { range, originalInput = input } = {}) {
  if (capabilities === undefined) return input;
  const cap = validateCapabilities(capabilities);
  const unsupported = field => { throw invalid(field, 'model_capability_unsupported'); };
  if (cap.tools === false && hasTools(input)) unsupported('tools');
  if (cap.inputModalities && !cap.inputModalities.includes('image') && hasImage(input, protocol)) unsupported(protocol === 'Res' ? 'input.content' : 'messages.content');
  let next = { ...input };
  if (cap.maxOutputTokens !== undefined) {
    const fields = protocol === 'Res' ? ['max_output_tokens'] : protocol === 'Mes' ? ['max_tokens'] : ['max_completion_tokens', 'max_tokens'];
    for (const field of fields) if (Object.hasOwn(input, field) && (!Number.isSafeInteger(input[field]) || input[field] <= 0)) throw invalid(field, 'invalid_max_output_tokens');
    const field = fields.find(key => Object.hasOwn(input, key)) || (protocol === 'Chat' ? 'max_tokens' : fields[0]);
    next[field] = Math.min(input[field] ?? cap.maxOutputTokens, cap.maxOutputTokens);
    // Never send competing Chat token ceilings with conflicting values.
    if (protocol === 'Chat' && field === 'max_completion_tokens') delete next.max_tokens;
  }
  if (cap.reasoningEfforts !== undefined) {
    const levels = supportedEfforts(cap, range);
    if (!levels.some(level => level !== 'none') && input.thinking && input.thinking.type !== 'disabled') unsupported('thinking');
    let effort = effortOf(next, protocol);
    const original = effortOf(originalInput, protocol);
    if (range && (original === undefined || original === '')) effort = levels.reduce((best, level) => Math.abs(LEVELS.indexOf(level) - 3) < Math.abs(LEVELS.indexOf(best) - 3) ? level : best, levels[0]);
    if (effort !== undefined) {
      if (typeof effort !== 'string' || !levels.includes(effort.trim())) unsupported(protocol === 'Res' ? 'reasoning.effort' : protocol === 'Mes' ? 'output_config.effort' : 'reasoning_effort');
      if (protocol === 'Res') next.reasoning = { ...next.reasoning, effort: effort.trim() };
      else if (protocol === 'Mes') next.output_config = { ...next.output_config, effort: effort.trim() };
      else next.reasoning_effort = effort.trim();
    }
  }
  return next;
}
