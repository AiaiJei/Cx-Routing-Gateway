import { describe, expect, it } from "vitest";
import { selectRequestLogs } from "./request-log-filter";
import type { CallLog } from "./types";

const filters = { query: "", status: "全部", dateRange: "实时" as const };
function log(id: string, time: string, overrides: Partial<CallLog> = {}): CallLog {
  return { id, time, model: "reasoner", credential: "已脱敏", upstream: "local", direction: "Res → Chat → Res", status: "成功", durationMs: 10, ...overrides };
}
const ids = (logs: CallLog[]) => logs.map(({ id }) => id);

describe("request log view selection", () => {
  it("sorts by actual instant newest first, keeps ties stable and invalid timestamps last without mutating input", () => {
    const input = Object.freeze([
      log("invalid-a", "invalid"),
      log("older", "2026-11-20T09:00:00+08:00"),
      log("newest", "2026-11-20T01:30:00Z"),
      log("same-instant", "2026-11-20T10:30:00+09:00"),
      log("invalid-b", ""),
    ]);
    expect(ids(selectRequestLogs(input, filters))).toEqual(["newest", "same-instant", "older", "invalid-a", "invalid-b"]);
    expect(input.map(({ id }) => id)).toEqual(["invalid-a", "older", "newest", "same-instant", "invalid-b"]);
  });

  it("uses local midnight and the current instant as today's inclusive bounds", () => {
    const now = new Date(2026, 10, 20, 12, 0, 0);
    const input = [
      log("yesterday", new Date(2026, 10, 19, 23, 59, 59, 999).toISOString()),
      log("midnight", new Date(2026, 10, 20, 0).toISOString()),
      log("now", now.toISOString()),
      log("future", new Date(2026, 10, 20, 12, 0, 0, 1).toISOString()),
      log("invalid", "unknown"),
    ];
    expect(ids(selectRequestLogs(input, { ...filters, dateRange: "今日" }, now))).toEqual(["now", "midnight"]);
    expect(selectRequestLogs(input, filters, now)).toHaveLength(5);
  });

  it.each([
    { range: "近7天" as const, start: new Date(2026, 10, 14), before: new Date(2026, 10, 13, 23, 59, 59, 999) },
    { range: "近30天" as const, start: new Date(2026, 9, 22), before: new Date(2026, 9, 21, 23, 59, 59, 999) },
  ])("includes exactly the calendar days in $range", ({ range, start, before }) => {
    const now = new Date(2026, 10, 20, 12);
    const input = [log("before", before.toISOString()), log("start", start.toISOString()), log("now", now.toISOString()), log("future", new Date(2026, 10, 21).toISOString())];
    expect(ids(selectRequestLogs(input, { ...filters, dateRange: range }, now))).toEqual(["now", "start"]);
  });

  it.each([
    { name: "year boundary", now: new Date(2027, 0, 3, 12), range: "近7天" as const, start: new Date(2026, 11, 28) },
    { name: "leap February", now: new Date(2024, 2, 1, 12), range: "近30天" as const, start: new Date(2024, 1, 1) },
    { name: "spring DST", now: new Date(2026, 2, 10, 12), range: "近7天" as const, start: new Date(2026, 2, 4) },
    { name: "autumn DST", now: new Date(2026, 10, 3, 12), range: "近7天" as const, start: new Date(2026, 9, 28) },
  ])("handles $name with calendar arithmetic", ({ now, range, start }) => {
    const input = [log("start", start.toISOString()), log("before", new Date(start.getTime() - 1).toISOString())];
    expect(ids(selectRequestLogs(input, { ...filters, dateRange: range }, now))).toEqual(["start"]);
  });

  it.each([
    { range: "近7天" as const, startDay: 31 },
    { range: "近30天" as const, startDay: 8 },
  ])("keeps the first hour of $range when today skips midnight for DST", ({ range, startDay }) => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Santiago";
    try {
      const now = new Date(2026, 8, 6, 12);
      const input = [
        log("midnight", new Date(2026, 7, startDay, 0).toISOString()),
        log("half-hour", new Date(2026, 7, startDay, 0, 30).toISOString()),
        log("one-hour", new Date(2026, 7, startDay, 1).toISOString()),
      ];
      expect(ids(selectRequestLogs(input, { ...filters, dateRange: range }, now))).toEqual(["one-hour", "half-hour", "midnight"]);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it("intersects date, status and case-insensitive search, including request type and error", () => {
    const now = new Date(2026, 10, 20, 12);
    const input = [
      log("target", now.toISOString(), { status: "失败", stream: true, error: "Timeout" }),
      log("success", now.toISOString(), { stream: true, error: "Timeout" }),
      log("old-failed", new Date(2026, 10, 18).toISOString(), { status: "失败", error: "Timeout" }),
    ];
    expect(ids(selectRequestLogs(input, { query: " TIMEOUT ", status: "失败", dateRange: "今日" }, now))).toEqual(["target"]);
    expect(ids(selectRequestLogs(input, { query: "流", status: "失败", dateRange: "今日" }, now))).toEqual(["target"]);
    expect(selectRequestLogs(input, { ...filters, query: "absent" }, now)).toEqual([]);
    expect(selectRequestLogs([], filters, now)).toEqual([]);
  });
});
