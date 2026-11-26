const LEVELS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (field = 'capabilities', code = 'invalid_model_capabilities') => Object.assign(new Error(code), { code, statusCode: 400, field });
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 100000000;

function validateCapabilities(value) {
  if (!record(value) || Object.keys(value).some(key => !['contextWindow', 'maxOutputTokens', 'inputModalities', 'reasoningEfforts', 'tools'].includes(key))) throw invalid();
  const result = {};
  for (const key of ['contextWindow', 'maxOutputTokens']) {
    if (value[key] === undefined) continue;
    if (!positive(value[key])) throw invalid('capabilities.' + key);
    result[key] = value[key];
  }
  if (result.contextWindow && result.maxOutputTokens > result.contextWindow) throw invalid('capabilities.maxOutputTokens');
  for (const [key, allowed] of [['inputModalities', ['text', 'image']], ['reasoningEfforts', LEVELS]]) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key]) || value[key].length > allowed.length || value[key].some(item => !allowed.includes(item)) || new Set(value[key]).size !== value[key].length || (key === 'inputModalities' && !value[key].includes('text'))) throw invalid('capabilities.' + key);
    result[key] = allowed.filter(item => value[key].includes(item));
  }
  if (value.tools !== undefined) {
    if (typeof value.tools !== 'boolean') throw invalid('capabilities.tools');
    result.tools = value.tools;
  }
  return result;
}

function supportedEfforts(capabilities, range) {
  const configured = capabilities?.reasoningEfforts;
  const levels = configured === undefined ? (range ? LEVELS : LEVELS.slice(0, 6)) : configured;
  if (!range) return [...levels];
  if (!LEVELS.includes(range.min) || !LEVELS.includes(range.max) || LEVELS.indexOf(range.min) > LEVELS.indexOf(range.max)) throw invalid('reasoning', 'invalid_reasoning_range');
  const result = levels.filter(level => LEVELS.indexOf(level) >= LEVELS.indexOf(range.min) && LEVELS.indexOf(level) <= LEVELS.indexOf(range.max));
  if (!result.length) throw invalid('reasoning', 'model_reasoning_range_conflict');
  return result;
}

function updateRouteCapabilities(route, input) {
  const next = { ...route };
  if (Object.hasOwn(input, 'capabilities')) {
    if (input.capabilities === null) delete next.capabilities;
    else next.capabilities = validateCapabilities(input.capabilities);
  }
  if (next.capabilities !== undefined) {
    next.capabilities = validateCapabilities(next.capabilities);
    supportedEfforts(next.capabilities, next.reasoning);
  }
  return next;
}

function modelCapabilitiesEntries(entries, modelIds) {
  const result = new Map();
  if (entries === undefined) return result;
  if (!Array.isArray(entries) || entries.length > 512) throw invalid();
  for (const entry of entries) {
    if (!record(entry) || Object.keys(entry).some(key => !['modelId', 'capabilities'].includes(key)) || !Object.hasOwn(entry, 'capabilities') || !modelIds.has(entry.modelId) || result.has(entry.modelId)) throw invalid();
    result.set(entry.modelId, entry.capabilities === null ? null : validateCapabilities(entry.capabilities));
  }
  return result;
}
module.exports = { LEVELS, validateCapabilities, supportedEfforts, updateRouteCapabilities, modelCapabilitiesEntries, invalid };
