// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routeModelOptions, routeSelectionTargets, REASONING_LEVELS, validReasoningRange } from "./route-selection";

const upstreams = [
  { id: "a", models: ["shared", "a-only"] }, { id: "b", models: ["shared", "b-only"] }, { id: "c", models: [] },
];
describe("unified route selection", () => {
  it("unions exact model IDs in priority order without duplicates", () => {
    expect(routeModelOptions(upstreams, ["b", "a"])).toEqual(["shared", "b-only", "a-only"]);
  });
  it("matches only advertising upstreams and retains only exact original missing targets", () => {
    const original = [{ upstreamId: "a", upstreamModel: "old" }];
    expect(routeSelectionTargets(upstreams, ["b", "a", "c"], ["shared", "old"], original)).toEqual([
      { upstreamId: "b", modelId: "shared" }, { upstreamId: "a", modelId: "shared" }, { upstreamId: "a", modelId: "old" },
    ]);
    expect(routeModelOptions(upstreams, ["b"], original)).not.toContain("old");
    expect(routeSelectionTargets(upstreams, ["b"], ["old"], original)).toEqual([]);
  });
  it("does not rank persistent and rejects reversed or unknown effort ranges", () => {
    expect(REASONING_LEVELS).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(validReasoningRange({ min: "none", max: "max" })).toBe(true);
    expect(validReasoningRange({ min: "max", max: "high" })).toBe(false);
    expect(validReasoningRange({ min: "low", max: "persistent" })).toBe(false);
    expect(validReasoningRange({ min: "low", max: "ultra" })).toBe(false);
  });
});


it("keeps renderer effort choices identical to the shared runtime policy", async () => {
  const sharedUrl = new URL("../../../../packages/shared/src/reasoning-policy.mjs", import.meta.url).href;
  const shared = await import(/* @vite-ignore */ sharedUrl);
  expect(REASONING_LEVELS).toEqual(shared.REASONING_LEVELS);
  for (const min of REASONING_LEVELS) for (const max of REASONING_LEVELS) {
    if (validReasoningRange({ min, max })) expect(shared.validateReasoningRange({ min, max })).toEqual({ min, max });
    else expect(() => shared.validateReasoningRange({ min, max })).toThrow("invalid_reasoning_range");
  }
});
