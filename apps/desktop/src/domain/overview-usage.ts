import type { CallLog } from "./types";

export type OverviewUsageTrend = {
  windowStart: number;
  windowEnd: number;
  buckets: { startsAt: number; count: number }[];
  observedCount: number;
  retentionReached: boolean;
};

export function buildOverviewUsageTrend(
  logs: Pick<CallLog, "time">[],
  nowMs: number,
  retentionLimit?: number,
): OverviewUsageTrend {
  if (!Number.isFinite(nowMs)) throw new RangeError("nowMs must be a finite timestamp");

  const hourMs = 60 * 60 * 1000;
  const windowStart = nowMs - 24 * hourMs;
  const buckets = Array.from({ length: 24 }, (_, index) => ({ startsAt: windowStart + index * hourMs, count: 0 }));
  let observedCount = 0;

  for (const log of logs) {
    const timestamp = Date.parse(log.time);
    if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp >= nowMs) continue;

    const bucketIndex = Math.floor((timestamp - windowStart) / hourMs);
    buckets[bucketIndex].count += 1;
    observedCount += 1;
  }

  const retentionReached = typeof retentionLimit === "number" && Number.isSafeInteger(retentionLimit) &&
    retentionLimit > 0 && logs.length >= retentionLimit;

  return {
    windowStart,
    windowEnd: nowMs,
    buckets,
    observedCount,
    retentionReached,
  };
}
