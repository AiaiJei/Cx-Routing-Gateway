import type { OverviewModelSummary } from "./overview-analytics";
import { formatMetric } from "./request-log";

export type ModelSegment = OverviewModelSummary & { color: string; share: number; start: number };
export type ModelDistribution = { total: number; segments: ModelSegment[] };
const modelPalette = ["#2b66b1", "#c76125", "#27834c", "#c83772", "#b59b22", "#268fa5", "#9b5c20", "#346e83", "#c34747", "#637f2c"];

function modelColor(hue: number, lightness: number): string {
  const light = lightness / 100;
  const amplitude = 0.65 * Math.min(light, 1 - light);
  const channel = (offset: number) => {
    const phase = (offset + hue / 30) % 12;
    return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(phase - 3, 9 - phase, 1)))).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function buildModelDistribution(models: OverviewModelSummary[]): ModelDistribution {
  const ranked = models.filter((model) => Number.isSafeInteger(model.calls) && model.calls > 0)
    .slice().sort((first, second) => second.calls - first.calls || first.model.localeCompare(second.model));
  const colors = new Map<string, string>();
  const usedColors = new Set<string>();
  for (const name of ranked.map((model) => model.model).sort()) {
    let hash = 2166136261;
    for (const character of name) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0;
    const hue = (hash % 3600000) / 10000;
    const lightness = 42 + ((hash >>> 24) % 8);
    let color = modelPalette.map((_, index) => modelPalette[(hash + index) % modelPalette.length]).find((candidate) => !usedColors.has(candidate)) ?? modelColor(hue, lightness);
    let colorValue = Number.parseInt(color.slice(1), 16);
    for (let attempt = 0; usedColors.has(color) && attempt <= usedColors.size; attempt += 1) {
      colorValue = (colorValue + 0x5f3565) & 0xffffff;
      color = `#${colorValue.toString(16).padStart(6, "0")}`;
    }
    usedColors.add(color);
    colors.set(name, color);
  }
  const total = ranked.reduce((sum, model) => sum + model.calls, 0);
  let start = 0;
  const segments = ranked.map((model) => {
    const share = model.calls / total;
    const segment = { ...model, color: colors.get(model.model)!, share, start };
    start += share;
    return segment;
  });
  return { total, segments };
}

export function formatModelShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function compactChartValue(value: number): string {
  return value < 10000 ? formatMetric(value) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
