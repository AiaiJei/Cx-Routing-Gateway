import { requestType } from "./request-log";
import type { CallLog } from "./types";

export const requestLogDateRanges = ["实时", "今日", "近7天", "近30天"] as const;
export type RequestLogDateRange = typeof requestLogDateRanges[number];
type RequestLogFilters = { query: string; status: string; dateRange: RequestLogDateRange };

export function selectRequestLogs(logs: readonly CallLog[], { query, status, dateRange }: RequestLogFilters, now = new Date()): CallLog[] {
  const needle = query.trim().toLowerCase();
  const daysBack = dateRange === "近7天" ? 6 : dateRange === "近30天" ? 29 : 0;
  // Construct the target day's midnight directly: today may skip midnight for DST.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
  const startTime = start.getTime();
  const endTime = now.getTime();

  return logs.map((log) => ({ log, time: new Date(log.time).getTime() }))
    .filter(({ log, time }) => {
      const textMatches = `${log.id} ${log.model} ${log.credential} ${log.upstream} ${log.direction} ${requestType(log)} ${log.error ?? ""}`.toLowerCase().includes(needle);
      const dateMatches = dateRange === "实时" || (time >= startTime && time <= endTime);
      return textMatches && dateMatches && (status === "全部" || log.status.startsWith(status));
    })
    .sort((a, b) => {
      if (!Number.isFinite(a.time)) return Number.isFinite(b.time) ? 1 : 0;
      if (!Number.isFinite(b.time)) return -1;
      return b.time - a.time;
    })
    .map(({ log }) => log);
}
