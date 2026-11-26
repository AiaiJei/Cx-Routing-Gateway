import { describe, expect, it } from "vitest";
import { buildOverviewAnalytics } from "./overview-analytics";
import type { CallLog } from "./types";
import { mapRuntimeState } from "../data/workspace-client";

const now = Date.parse("2026-11-26T12:00:00Z");
const base: CallLog = { id: "one", time: "2026-11-26T10:00:00Z", model: "alpha", credential: "—", upstream: "—", direction: "Res → Chat → Res", status: "成功", durationMs: 100 };

describe("buildOverviewAnalytics", () => {
  it("reconciles per-model calls with summary and preserves partial token reporting", () => {
    const result = buildOverviewAnalytics([
      { ...base, tokens: { input: 10, output: 5, total: 15, cacheRead: 4, cacheWrite: 2 } },
      { ...base, id: "two", time: "2026-11-26T11:00:00Z", status: "失败", durationMs: 300, tokens: { input: 0, output: 0, total: 0, cacheRead: 0 } },
      { ...base, id: "three", model: "beta", durationMs: null, tokens: { output: 7 } },
    ], "retained", now);
    expect(result.summary).toMatchObject({ calls: 3, succeeded: 2, failed: 1, averageDurationMs: 200, durationReported: 2 });
    expect(result.summary.successRate).toBeCloseTo(200 / 3);
    expect(result.summary.tokens).toEqual({
      total: { value: 15, reported: 2 }, input: { value: 10, reported: 2 }, output: { value: 12, reported: 3 },
      cacheRead: { value: 4, reported: 2 }, cacheWrite: { value: 2, reported: 1 },
    });
    expect(result.models.map((model) => model.model)).toEqual(["alpha", "beta"]);
    expect(result.models[0]).toMatchObject({ calls: 2, succeeded: 1, failed: 1, successRate: 50, latestStatus: "失败" });
    expect(result.models[1].tokens.total).toEqual({ value: null, reported: 0 });
    expect(result.models.reduce((total, model) => total + model.calls, 0)).toBe(result.summary.calls);
    expect(result.models.reduce((total, model) => total + (model.tokens.total.value ?? 0), 0)).toBe(result.summary.tokens.total.value);
  });

  it("uses inclusive start and exclusive end for the rolling window", () => {
    const logs = [
      { ...base, id: "start", time: "2026-11-25T12:00:00Z" },
      { ...base, id: "before", time: "2026-11-25T11:59:59.999Z" },
      { ...base, id: "end", time: "2026-11-26T12:00:00Z" },
      { ...base, id: "invalid", time: "not-a-date" },
      { ...base, id: "inside", time: "2026-11-26T11:59:59.999Z" },
    ];
    const result = buildOverviewAnalytics(logs, "24h", now, 5);
    expect(result.logs.map((log) => log.id)).toEqual(["inside", "start"]);
    expect(result.summary.calls).toBe(2);
    expect(result.retentionReached).toBe(true);
    expect(buildOverviewAnalytics(logs, "retained", now).summary.calls).toBe(5);
    expect(logs[0].id).toBe("start");
  });

  it("keeps missing metrics unknown and genuine zeroes visible", () => {
    const missing = buildOverviewAnalytics([{ ...base, durationMs: -1, tokens: { input: -1, output: NaN, total: Infinity, cacheRead: 1.5 } }], "retained", now);
    expect(missing.summary.tokens.total).toEqual({ value: null, reported: 0 });
    expect(missing.summary.tokens.input).toEqual({ value: null, reported: 0 });
    expect(missing.summary.tokens.cacheRead).toEqual({ value: null, reported: 0 });
    expect(missing.summary.averageDurationMs).toBeNull();
    const zero = buildOverviewAnalytics([{ ...base, durationMs: 0, tokens: { total: 0 } }], "retained", now);
    expect(zero.summary.tokens.total).toEqual({ value: 0, reported: 1 });
    expect(zero.summary.averageDurationMs).toBe(0);
  });

  it("does not derive total tokens or double count cache and reasoning fields", () => {
    const result = buildOverviewAnalytics([{ ...base, tokens: { input: 10, output: 5, cacheRead: 8, reasoning: 3 } }], "retained", now);
    expect(result.summary.tokens.total).toEqual({ value: null, reported: 0 });
    expect(result.summary.tokens.input.value).toBe(10);
  });

  it("handles empty data, unsafe totals and invalid reference time", () => {
    const result = buildOverviewAnalytics([], "retained", now, 0);
    expect(result.summary).toMatchObject({ calls: 0, successRate: null, averageDurationMs: null });
    expect(result.models).toEqual([]);
    expect(result.retentionReached).toBe(false);
    const overflow = buildOverviewAnalytics([{ ...base, tokens: { total: Number.MAX_SAFE_INTEGER } }, { ...base, tokens: { total: 1 } }], "retained", now);
    expect(overflow.summary.tokens.total.value).toBeNull();
    expect(() => buildOverviewAnalytics([], "24h", NaN)).toThrow(RangeError);
  });

  it("groups model keys safely and determines the latest result by timestamp", () => {
    const result = buildOverviewAnalytics([
      { ...base, model: "__proto__", time: "2026-11-26T11:00:00Z", status: "失败" },
      { ...base, model: "__proto__", time: "2026-11-26T09:00:00Z" },
      { ...base, model: "", time: "invalid" },
    ], "retained", now);
    expect(result.models[0]).toMatchObject({ model: "__proto__", calls: 2, latestStatus: "失败" });
    expect(result.models[1]).toMatchObject({ model: "未标识模型", latestStatus: null });
  });

  it("accepts legacy runtime records without a model identifier", () => {
    const workspace = mapRuntimeState({ settings: { gatewayHost: "127.0.0.1", gatewayPort: 8317 }, upstreams: [], routes: [], clientKeys: [], usage: [{ requestId: "legacy", status: "failed" }] });
    expect(buildOverviewAnalytics(workspace.logs, "retained", now).models[0]).toMatchObject({ model: "未标识模型", calls: 1, failed: 1, latestStatus: null });
  });
});
