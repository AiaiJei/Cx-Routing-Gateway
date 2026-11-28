import type { CallLog } from "./types";
import { sanitizeTokens } from "./request-log";

export function buildTokenComposition(logs: readonly Pick<CallLog, "tokens">[]) {
  let input = 0;
  let output = 0;
  let reported = 0;
  for (const log of logs) {
    const tokens = sanitizeTokens(log.tokens);
    if (tokens?.input === undefined || tokens.output === undefined) continue;
    reported += 1;
    input += tokens.input;
    output += tokens.output;
  }
  const total = input + output;
  if (!reported || !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || !Number.isSafeInteger(total)) {
    return { input: null, output: null, total: null, reported };
  }
  return { input, output, total, reported };
}
