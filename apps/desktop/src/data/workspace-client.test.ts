import { describe, expect, it } from "vitest";
import { fixtureWorkspaceClient, mapRuntimeState } from "./workspace-client";

describe("fixtureWorkspaceClient", () => {
  it("marks workspace data as fixtures and returns independent copies", async () => {
    const first = await fixtureWorkspaceClient.getWorkspace();
    first.upstreams.pop();
    const second = await fixtureWorkspaceClient.getWorkspace();

    expect(second.meta).toEqual({ source: "fixture", live: false });
    expect(second.upstreams).toHaveLength(2);
    expect(second.gateway.state).toBe("未接入");
  });

  it("reports upstream checks as simulations without attempting a connection", async () => {
    const result = await fixtureWorkspaceClient.simulateUpstreamTest("up-northstar");
    expect(result.simulated).toBe(true);
    expect(result.message).toContain("未执行");
  });

  it("keeps credentials masked in the fixture data", async () => {
    const { credentials } = await fixtureWorkspaceClient.getWorkspace();
    expect(credentials.every(({ preview }) => preview.includes("••••"))).toBe(true);
    expect(credentials.some(({ preview }) => /[A-Za-z0-9]{24,}/.test(preview))).toBe(false);
  });

  it("marks a checked runtime upstream as connected", () => {
    const workspace = mapRuntimeState({
      settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318, usageRetentionCount: 1000 },
      runtimeStatus: { state: "running" },
      metrics: {},
      upstreams: [{ id: "up-checked", name: "Checked", baseUrl: "https://api.example/v1", credentialRef: "cred", enabled: true, models: ["model"], lastCheckedAt: "2026-11-19T00:00:00.000Z" }],
      routes: [], usage: [], clientKeys: [],
    });
    expect(workspace.upstreams[0].status).toBe("已连接");
  });
});

it("maps measured metrics while preserving missing, zero and invalid historical values", () => {
  const state = { settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [], usage: [
    { requestId: "zero", createdAt: "2026-11-19T00:00:00.000Z", inboundProtocol: "Chat", outboundProtocol: "Res", status: "completed", stream: true, durationMs: 0, firstTokenMs: 0, tokens: { input: 0, output: 12, cacheRead: 0, total: 12, private: "secret" } },
    { requestId: "legacy", status: "failed" },
    { requestId: "invalid", stream: "false", durationMs: -1, firstTokenMs: Infinity, tokens: { input: "100", output: -2, cacheWrite: 1.5 } },
  ] };
  const [zero, legacy, invalid] = mapRuntimeState(state).logs;
  expect(zero).toMatchObject({ stream: true, durationMs: 0, firstTokenMs: 0, tokens: { input: 0, output: 12, cacheRead: 0, total: 12 } });
  expect(zero.tokens).not.toHaveProperty("private");
  expect(legacy.durationMs).toBeNull();
  expect(legacy.stream).toBeUndefined();
  expect(legacy.firstTokenMs).toBeUndefined();
  expect(invalid.durationMs).toBeNull();
  expect(invalid.stream).toBeUndefined();
  expect(invalid.firstTokenMs).toBeUndefined();
  expect(invalid.tokens).toBeUndefined();
});

it("prefers the persisted upstream name, falls back by ID, and redacts unknown sources", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 },
    upstreams: [{ id: "up-current", name: "Current service", enabled: true, models: [] }],
    routes: [], clientKeys: [],
    usage: [
      { requestId: "snapshot", upstreamId: "up-current", upstreamName: "Renamed before display", status: "completed" },
      { requestId: "legacy", upstreamId: "up-current", status: "completed" },
      { requestId: "missing", upstreamId: "up-missing", status: "failed" },
    ],
  });

  expect(workspace.logs.map(({ id, upstream }) => [id, upstream])).toEqual([
    ["snapshot", "Renamed before display"],
    ["legacy", "Current service"],
    ["missing", "—"],
  ]);
});

it("maps an optional reasoning level and leaves legacy rows undefined", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 },
    upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "reasoned", reasoningEffort: "high", status: "completed" },
      { requestId: "legacy", status: "completed" },
    ],
  });
  expect(workspace.logs.map(({ id, reasoning }) => [id, reasoning])).toEqual([["reasoned", "high"], ["legacy", undefined]]);
});

it("maps HTTP, upstream, and gateway status details without raw provider text", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "ok", status: "completed", httpStatus: 200 },
      { requestId: "upstream", status: "failed", upstreamStatus: 429, errorCode: "upstream_error" },
      { requestId: "gateway", status: "failed", gatewayStatus: 400, errorCode: "unsupported_feature", providerMessage: "secret provider detail" },
    ],
  });
  expect(workspace.logs.map(({ id, httpStatus, upstreamStatus, gatewayStatus, error }) => [id, httpStatus, upstreamStatus, gatewayStatus, error])).toEqual([
    ["ok", 200, undefined, undefined, undefined],
    ["upstream", undefined, 429, undefined, "上游请求失败，请检查上游状态和日志"],
    ["gateway", undefined, undefined, 400, "当前请求包含不支持的协议特性"],
  ]);
  expect(JSON.stringify(workspace.logs)).not.toContain("secret provider detail");
});

it("maps stream completion, empty output, usage gaps, resets, and cancellation without changing legacy rows", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "empty", status: "failed", stream: true, streamCompletion: "completed", outputObserved: false, usageObserved: false, errorCode: "upstream_empty_response", httpStatus: 200 },
      { requestId: "reasoning-only", status: "completed", stream: true, streamCompletion: "completed", outputObserved: false, reasoningObserved: true, usageObserved: true, tokens: { output: 7, reasoning: 7 } },
      { requestId: "zero-output", status: "completed", stream: true, streamCompletion: "completed", outputObserved: false, usageObserved: true, tokens: { output: 0 } },
      { requestId: "missing-usage", status: "completed", stream: true, streamCompletion: "completed", outputObserved: true, usageObserved: false },
      { requestId: "reset", status: "failed", stream: true, streamCompletion: "incomplete", outputObserved: true, errorCode: "upstream_connection_reset", gatewayStatus: 502 },
      { requestId: "cancelled", status: "failed", errorCode: "client_disconnected" },
      { requestId: "legacy", status: "completed" },
    ],
  });

  expect(workspace.logs.map(({ id, status, error, streamCompletion, outputObserved, reasoningObserved, usageObserved }) => [id, status, error, streamCompletion, outputObserved, reasoningObserved, usageObserved])).toEqual([
    ["empty", "失败·空响应", "上游疑似空响应", "completed", false, undefined, false],
    ["reasoning-only", "失败·空响应", undefined, "completed", false, true, true],
    ["zero-output", "失败·空响应", undefined, "completed", false, undefined, true],
    ["missing-usage", "成功·缺用量", undefined, "completed", true, undefined, false],
    ["reset", "失败", "上游连接被重置（ECONNRESET）", "incomplete", true, undefined, undefined],
    ["cancelled", "失败·已取消", "客户端在响应完成前断开", undefined, undefined, undefined, undefined],
    ["legacy", "成功", undefined, undefined, undefined, undefined, undefined],
  ]);
});
