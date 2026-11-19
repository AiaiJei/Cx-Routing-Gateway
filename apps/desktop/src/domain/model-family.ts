import type { ModelRoute } from "./types";

export const MODEL_FAMILIES = [
  { id: "gpt", label: "gpt" },
  { id: "claude", label: "claude" },
  { id: "gemini", label: "gemini" },
  { id: "glm", label: "glm" },
  { id: "deepseek", label: "deepseek" },
  { id: "kimi", label: "kimi" },
  { id: "other", label: "其他" },
] as const;

export type ModelFamily = typeof MODEL_FAMILIES[number]["id"];
export type ModelFamilySelection = ModelFamily | "all";

const familyPatterns: readonly [ModelFamily, RegExp][] = [
  ["gpt", /(?:^|[\s_.:-])(?:gpt|chatgpt)(?=$|[\s_.:-]|\d)|(?:^|[\s_.:-])o[134](?=$|[\s_.:-])/],
  ["claude", /(?:^|[\s_.:-])claude(?=$|[\s_.:-]|\d)/],
  ["gemini", /(?:^|[\s_.:-])gemini(?=$|[\s_.:-]|\d)/],
  ["glm", /(?:^|[\s_.:-])(?:chatglm|glm)(?=$|[\s_.:-]|\d)/],
  ["deepseek", /(?:^|[\s_.:-])deepseek(?=$|[\s_.:-]|\d)/],
  ["kimi", /(?:^|[\s_.:-])(?:kimi|moonshot)(?=$|[\s_.:-]|\d)/],
];

export function getModelFamily(model: string): ModelFamily {
  // Namespace owners are not model families (e.g. deepseek-ai/qwen3).
  const name = model.trim().toLowerCase().split(/[\\/]/).at(-1) ?? "";
  return familyPatterns.find(([, pattern]) => pattern.test(name))?.[0] ?? "other";
}

export function getRouteModelFamily(route: ModelRoute): ModelFamily {
  return getModelFamily(route.targets[0]?.upstreamModel ?? route.alias);
}
