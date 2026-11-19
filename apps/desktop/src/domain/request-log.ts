import type { CallLog, RequestTokens } from "./types";

export const tokenFields = [
  ["input", "输入"], ["output", "输出"], ["cacheRead", "缓存读取"], ["cacheWrite", "缓存写入"],
  ["total", "总 Token"], ["reasoning", "推理"], ["inputAudio", "输入音频"], ["outputAudio", "输出音频"],
  ["cacheWrite5m", "缓存写入 · 5 分钟"], ["cacheWrite1h", "缓存写入 · 1 小时"],
] as const;

export function finiteMetric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
export function sanitizeTokens(value: unknown): RequestTokens | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: RequestTokens = {};
  for (const [key] of tokenFields) {
    const count = (value as Record<string, unknown>)[key];
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) result[key] = count;
  }
  return Object.keys(result).length ? result : undefined;
}
export function formatRequestTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function formatMetric(value: number | null | undefined): string {
  return finiteMetric(value) === undefined ? "—" : Math.round(value!).toLocaleString("en-US");
}
export function formatDuration(value: number | null | undefined): string {
  return finiteMetric(value) === undefined ? "—" : `${formatMetric(value)} ms`;
}
export function requestType(log: CallLog): string {
  return log.stream === undefined ? "—" : log.stream ? "流" : "非流";
}
