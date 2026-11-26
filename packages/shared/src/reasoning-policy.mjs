/** Ordered forwarding levels. This is not a provider/model capability list. */
export const REASONING_LEVELS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (code, field) => Object.assign(new Error(code), { code, statusCode: 400, ...(field ? { field } : {}) });

export function validateReasoningRange(value) {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'min' && key !== 'max') || !REASONING_LEVELS.includes(value.min) || !REASONING_LEVELS.includes(value.max) || REASONING_LEVELS.indexOf(value.min) > REASONING_LEVELS.indexOf(value.max)) {
    throw invalid('invalid_reasoning_range', 'reasoning');
  }
  return { min: value.min, max: value.max };
}

/** Omission preserves a route policy; null explicitly removes it. */
export function updateRouteReasoning(route, input) {
  if (!Object.hasOwn(input, 'reasoning')) return route;
  const next = { ...route };
  if (input.reasoning === null) delete next.reasoning;
  else next.reasoning = validateReasoningRange(input.reasoning);
  return next;
}

function requestedLevel(value, field) {
  if (typeof value !== 'string') throw invalid('invalid_reasoning_effort', field);
  const level = value.trim();
  if (level && !REASONING_LEVELS.includes(level)) throw invalid('invalid_reasoning_effort', field);
  return level || undefined;
}

/** Enforce a saved interval before conversion without mutating the caller's body. */
export function applyRouteReasoningPolicy(input, protocol, range) {
  if (range === undefined) return { input };
  const validated = validateReasoningRange(range);
  const levels = {};
  if (Object.hasOwn(input, 'reasoning_effort')) levels.reasoning_effort = requestedLevel(input.reasoning_effort, 'reasoning_effort');
  for (const field of ['reasoning', 'output_config', 'thinking']) {
    if (!Object.hasOwn(input, field)) continue;
    if (!isRecord(input[field])) throw invalid('invalid_reasoning_effort', field);
    if (Object.hasOwn(input[field], 'effort')) levels[field] = requestedLevel(input[field].effort, `${field}.effort`);
  }
  const field = protocol === 'Res' ? 'reasoning' : protocol === 'Mes' ? 'output_config' : 'reasoning_effort';
  const requested = levels[field] ?? 'medium';
  const index = Math.max(REASONING_LEVELS.indexOf(validated.min), Math.min(REASONING_LEVELS.indexOf(validated.max), REASONING_LEVELS.indexOf(requested)));
  const effort = REASONING_LEVELS[index];
  const next = { ...input };
  if (field === 'reasoning_effort' || Object.hasOwn(input, 'reasoning_effort')) next.reasoning_effort = effort;
  for (const container of ['reasoning', 'output_config', 'thinking']) {
    if (container === field || Object.hasOwn(levels, container)) next[container] = { ...input[container], effort };
  }
  return { input: next, effort };
}
