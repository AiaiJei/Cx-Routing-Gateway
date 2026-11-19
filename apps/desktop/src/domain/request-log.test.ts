import { describe, expect, it } from "vitest";
import { formatRequestTime, formatDuration, requestType } from "./request-log";
import type { CallLog } from "./types";

describe("request log formatting", () => {
  it("formats local timestamps to seconds and keeps invalid time unknown", () => {
    const instant = new Date(2026, 10, 19, 9, 3, 2, 747).toISOString();
    expect(formatRequestTime(instant)).toBe("2026-11-19 09:03:02");
    expect(formatRequestTime("not-a-time")).toBe("—");
  });
  it("never substitutes zero for missing duration or nonstream for legacy type", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
    expect(requestType({} as CallLog)).toBe("—");
    expect(requestType({ stream: false } as CallLog)).toBe("非流");
  });
});
