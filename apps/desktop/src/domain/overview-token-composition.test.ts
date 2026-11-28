import { describe, expect, it } from "vitest";
import { buildTokenComposition } from "./overview-token-composition";

describe("buildTokenComposition", () => {
  it("sums complete input/output pairs without including cache in the denominator", () => {
    expect(buildTokenComposition([{ tokens: { input: 100, output: 20, cacheRead: 80 } }, { tokens: { input: 50, output: 30 } }])).toEqual({ input: 150, output: 50, total: 200, reported: 2 });
  });
  it("does not combine complementary partial records into a fabricated pair", () => {
    expect(buildTokenComposition([{ tokens: { input: 100 } }, { tokens: { output: 20 } }])).toEqual({ input: null, output: null, total: null, reported: 0 });
  });
  it("keeps explicitly reported zero distinct from missing values", () => {
    expect(buildTokenComposition([{ tokens: { input: 0, output: 0 } }])).toEqual({ input: 0, output: 0, total: 0, reported: 1 });
    expect(buildTokenComposition([{}])).toEqual({ input: null, output: null, total: null, reported: 0 });
  });
  it("rejects negative, non-finite and fractional fields", () => {
    expect(buildTokenComposition([{ tokens: { input: -1, output: 20 } }, { tokens: { input: 10, output: Infinity } }, { tokens: { input: 1.5, output: 10 } }])).toEqual({ input: null, output: null, total: null, reported: 0 });
  });
  it("does not draw unsafe accumulated values", () => {
    expect(buildTokenComposition([{ tokens: { input: Number.MAX_SAFE_INTEGER, output: 0 } }, { tokens: { input: 1, output: 0 } }])).toEqual({ input: null, output: null, total: null, reported: 2 });
    expect(buildTokenComposition([{ tokens: { input: Number.MAX_SAFE_INTEGER, output: 1 } }])).toEqual({ input: null, output: null, total: null, reported: 1 });
  });
});
