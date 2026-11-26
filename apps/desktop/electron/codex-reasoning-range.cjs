// Native CJS boundary mirrors the public route policy's ordered scalar levels.
const REASONING_LEVELS = Object.freeze(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
function validReasoningRange(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 2 && Object.keys(value).every(key => ["min", "max"].includes(key)) &&
    REASONING_LEVELS.includes(value.min) && REASONING_LEVELS.includes(value.max) &&
    REASONING_LEVELS.indexOf(value.min) <= REASONING_LEVELS.indexOf(value.max);
}
module.exports = { REASONING_LEVELS, validReasoningRange };
