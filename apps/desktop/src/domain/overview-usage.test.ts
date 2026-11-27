import { describe, expect, it } from "vitest";
import { buildOverviewUsageTrend } from "./overview-usage";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

describe("buildOverviewUsageTrend", () => {
  it("counts records across 24 hourly buckets with an inclusive start and exclusive end", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
    const trend = buildOverviewUsageTrend([
      { time: new Date(nowMs - dayMs).toISOString() },
      { time: new Date(nowMs - hourMs).toISOString() },
      { time: new Date(nowMs).toISOString() },
      { time: "not a timestamp" },
    ], nowMs, 4);

    expect(trend.windowStart).toBe(nowMs - dayMs);
    expect(trend.windowEnd).toBe(nowMs);
    expect(trend.buckets).toHaveLength(24);
    expect(trend.buckets[0]).toEqual({ startsAt: nowMs - dayMs, count: 1 });
    expect(trend.buckets[23]).toEqual({ startsAt: nowMs - hourMs, count: 1 });
    expect(trend.observedCount).toBe(2);
    expect(trend.retentionReached).toBe(true);
  });

  it("returns 24 zero-count buckets when there are no records", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
    const trend = buildOverviewUsageTrend([], nowMs);

    expect(trend.buckets).toHaveLength(24);
    expect(trend.buckets.every((bucket) => bucket.count === 0)).toBe(true);
    expect(trend.observedCount).toBe(0);
    expect(trend.retentionReached).toBe(false);
  });

  it("ignores valid records outside the requested 24-hour interval", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
    const trend = buildOverviewUsageTrend([
      { time: new Date(nowMs - dayMs - 1).toISOString() },
      { time: new Date(nowMs + 1).toISOString() },
    ], nowMs, 10);

    expect(trend.observedCount).toBe(0);
    expect(trend.buckets.every((bucket) => bucket.count === 0)).toBe(true);
    expect(trend.retentionReached).toBe(false);
  });

  it("reports when the number of returned records reaches the retention limit", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
    const logs = [{ time: new Date(nowMs - 1).toISOString() }, { time: "invalid" }];

    expect(buildOverviewUsageTrend(logs, nowMs, 2).retentionReached).toBe(true);
    expect(buildOverviewUsageTrend(logs, nowMs, 3).retentionReached).toBe(false);
    expect(buildOverviewUsageTrend(logs, nowMs, 0).retentionReached).toBe(false);
  });

  it("rejects a non-finite reference time", () => {
    expect(() => buildOverviewUsageTrend([], Number.NaN)).toThrow(RangeError);
  });
});
