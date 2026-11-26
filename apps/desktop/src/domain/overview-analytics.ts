import { finiteMetric, sanitizeTokens } from "./request-log";
import type { CallLog } from "./types";

export type OverviewRange = "retained" | "24h";
const tokenKeys = ["total", "input", "output", "cacheRead", "cacheWrite"] as const;
export type ReportedToken = { value: number | null; reported: number };
export type OverviewSummary = {
  calls: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  averageDurationMs: number | null;
  durationReported: number;
  tokens: Record<typeof tokenKeys[number], ReportedToken>;
};
export type OverviewModelSummary = OverviewSummary & { model: string; latestStatus: "成功" | "失败" | null };

function summarize(logs: readonly CallLog[]): OverviewSummary {
  const succeeded = logs.filter((log) => log.status.startsWith("成功")).length;
  const durations = logs.map((log) => finiteMetric(log.durationMs)).filter((duration): duration is number => duration !== undefined);
  const reportedTokens = logs.map((log) => sanitizeTokens(log.tokens));
  const tokens = Object.fromEntries(tokenKeys.map((key) => {
    const values = reportedTokens.map((entry) => entry?.[key]).filter((value): value is number => value !== undefined);
    const sum = values.reduce((total, value) => total + value, 0);
    return [key, { value: values.length && Number.isSafeInteger(sum) ? sum : null, reported: values.length }];
  })) as OverviewSummary["tokens"];
  return {
    calls: logs.length,
    succeeded,
    failed: logs.length - succeeded,
    successRate: logs.length ? succeeded / logs.length * 100 : null,
    averageDurationMs: durations.length ? Math.round(durations.reduce((total, duration) => total + duration / durations.length, 0)) : null,
    durationReported: durations.length,
    tokens,
  };
}

export function buildOverviewAnalytics(logs: readonly CallLog[], range: OverviewRange, nowMs: number, retentionLimit?: number) {
  if (!Number.isFinite(nowMs)) throw new RangeError("nowMs must be a finite timestamp");
  const windowStart = nowMs - 24 * 60 * 60 * 1000;
  const selected = logs.filter((log) => {
    if (range === "retained") return true;
    const timestamp = Date.parse(log.time);
    return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp < nowMs;
  }).sort((first, second) => {
    const firstTime = Date.parse(first.time);
    const secondTime = Date.parse(second.time);
    return (Number.isFinite(secondTime) ? secondTime : -Infinity) - (Number.isFinite(firstTime) ? firstTime : -Infinity);
  });
  const grouped = new Map<string, CallLog[]>();
  for (const log of selected) {
    const model = typeof log.model === "string" && log.model.trim() ? log.model.trim() : "未标识模型";
    const entries = grouped.get(model) ?? [];
    entries.push(log);
    grouped.set(model, entries);
  }
  const models: OverviewModelSummary[] = [...grouped].map(([model, entries]) => {
    const latest = entries.find((entry) => Number.isFinite(Date.parse(entry.time)));
    return { model, ...summarize(entries), latestStatus: latest ? latest.status.startsWith("成功") ? "成功" : "失败" : null };
  });
  models.sort((first, second) => second.calls - first.calls || first.model.localeCompare(second.model));
  return {
    logs: selected,
    summary: summarize(selected),
    models,
    retentionReached: typeof retentionLimit === "number" && Number.isSafeInteger(retentionLimit) && retentionLimit > 0 && logs.length >= retentionLimit,
  };
}

export function tokenCoverage(token: ReportedToken, calls: number): string {
  if (!calls) return "无调用记录";
  if (!token.reported) return "未上报";
  if (token.value === null) return "数值超出安全范围";
  return `${token.reported} / ${calls} 条上报`;
}

export function formatOverviewRate(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
