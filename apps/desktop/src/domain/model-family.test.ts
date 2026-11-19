import { describe, expect, it } from "vitest";
import { getModelFamily, getRouteModelFamily } from "./model-family";
import type { ModelRoute } from "./types";

describe("getModelFamily", () => {
  it.each([
    ["gpt-6-astra", "gpt"], [" GPT-4o ", "gpt"], ["openai/gpt-image-2", "gpt"],
    ["chatgpt-4o-latest", "gpt"], ["openai/o3-mini", "gpt"], ["o1", "gpt"], ["o4-mini", "gpt"],
    ["claude-sonnet-5", "claude"], ["anthropic/Claude-3.7-Sonnet", "claude"],
    ["us.anthropic.claude-3-5-sonnet-v2:0", "claude"],
    ["models/gemini-2.5-pro", "gemini"], ["google/GEMINI-4-carbon", "gemini"],
    ["glm-4.6", "glm"], ["z-ai/GLM-4.5-Air", "glm"], ["THUDM/chatglm3-6b", "glm"],
    ["deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", "deepseek"],
    ["deepseek-chat", "deepseek"], ["kimi-k2-instruct", "kimi"],
    ["moonshotai/Kimi-K2", "kimi"], ["moonshot-v1-128k", "kimi"],
    ["qwen3-32b", "other"], ["kling-3.0-turbo", "other"], ["", "other"],
    ["notgpt-4", "other"], ["gptish", "other"], ["myclaude", "other"],
    ["kimiko", "other"], ["geminix", "other"], ["glmatrix", "other"],
    ["o10", "other"], ["deepseek-ai/qwen3", "other"],
  ])("classifies %s as %s", (model, family) => expect(getModelFamily(model)).toBe(family));

  it("uses the displayed upstream model, then the alias only for a route without targets", () => {
    const route: ModelRoute = { id: "r", alias: "gpt-fast", targets: [{ upstreamId: "u", upstreamModel: "claude-sonnet-5" }], inboundProtocol: "Res", outboundProtocol: "Mes", enabled: true };
    expect(getRouteModelFamily(route)).toBe("claude");
    expect(getRouteModelFamily({ ...route, targets: [] })).toBe("gpt");
    expect(getRouteModelFamily({ ...route, targets: [{ upstreamId: "u", upstreamModel: "custom-model" }] })).toBe("other");
  });
});
