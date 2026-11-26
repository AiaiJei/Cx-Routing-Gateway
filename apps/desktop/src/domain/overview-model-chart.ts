import type { OverviewModelSummary } from "./overview-analytics";
import { formatOverviewRate } from "./overview-analytics";
import { finiteMetric, formatDuration, formatMetric } from "./request-log";

export const modelChartMetrics = [
  { key: "calls", label: "调用量", unit: "次", chartName: "模型调用量对比图" },
  { key: "tokens", label: "已上报 Token", unit: "Token", chartName: "模型已上报 Token 对比图" },
  { key: "successRate", label: "成功率", unit: "%", chartName: "模型成功率对比图" },
  { key: "duration", label: "平均耗时", unit: "ms", chartName: "模型平均耗时对比图" },
] as const;
export type ModelChartMetric = typeof modelChartMetrics[number]["key"];

export function modelChartValue(model: OverviewModelSummary, metric: ModelChartMetric): number | null {
  const value = metric === "tokens" ? model.tokens.total.value : metric === "duration" ? model.averageDurationMs : model[metric];
  return finiteMetric(value) ?? null;
}

export function modelChartMaximum(models: OverviewModelSummary[], metric: ModelChartMetric): number {
  if (metric === "successRate") return 100;
  const largest = models.reduce((maximum, model) => Math.max(maximum, modelChartValue(model, metric) ?? 0), 0);
  if (largest === 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(largest / 4));
  const step = Math.max(1, Math.ceil(largest / (4 * magnitude)) * magnitude);
  return step * 4;
}

export function formatModelMetric(value: number | null, metric: ModelChartMetric): string {
  if (metric === "successRate") return formatOverviewRate(value);
  if (metric === "duration") return formatDuration(value);
  return formatMetric(value);
}

export function compactChartValue(value: number | null, metric: ModelChartMetric): string {
  if (value === null) return "—";
  if (metric === "successRate") return `${value.toFixed(1)}%`;
  return value < 10000 ? formatMetric(value) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
