import type { ModelRoute, ReasoningEffort, ReasoningRange, Upstream } from "./types";

export const REASONING_LEVELS: readonly ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
type AvailableUpstream = Pick<Upstream, "id" | "models">;
type OriginalTarget = ModelRoute["targets"][number];

export function validReasoningRange(range: { min: string; max: string }): range is ReasoningRange {
  const min = REASONING_LEVELS.indexOf(range.min as ReasoningEffort);
  const max = REASONING_LEVELS.indexOf(range.max as ReasoningEffort);
  return min >= 0 && max >= min;
}

export function routeModelOptions(upstreams: readonly AvailableUpstream[], selectedIds: readonly string[], original: readonly OriginalTarget[] = []): string[] {
  return [...new Set(selectedIds.flatMap(id => [
    ...(upstreams.find(upstream => upstream.id === id)?.models ?? []),
    ...original.filter(target => target.upstreamId === id).map(target => target.upstreamModel),
  ]))];
}

export function routeSelectionTargets(upstreams: readonly AvailableUpstream[], selectedIds: readonly string[], models: readonly string[], original: readonly OriginalTarget[] = []) {
  return [...new Set(selectedIds)].flatMap(upstreamId => {
    const available = upstreams.find(upstream => upstream.id === upstreamId)?.models ?? [];
    return [...new Set(models)].filter(modelId => available.includes(modelId) || original.some(target => target.upstreamId === upstreamId && target.upstreamModel === modelId))
      .map(modelId => ({ upstreamId, modelId }));
  });
}

export function reasoningRangeLabel(range?: ReasoningRange) {
  return range ? `${range.min} → ${range.max}` : "不限（兼容旧路由）";
}
