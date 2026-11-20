import type { WorkspaceFixtures } from "../domain/types";

export const workspaceFixtures: WorkspaceFixtures = {
  meta: { source: "fixture", live: false },
  gateway: { state: "未接入", url: "http://127.0.0.1:8317" },
  upstreams: [
    {
      id: "up-northstar",
      name: "Northstar AI",
      baseUrl: "https://api.northstar.example/v1",
      credentialLabel: "Northstar key",
      status: "未连接",
      models: ["northstar-large", "northstar-fast"],
    },
    {
      id: "up-lantern",
      name: "Lantern Labs",
      baseUrl: "https://api.lantern.example/v1",
      credentialLabel: "Lantern key",
      status: "待测试",
      models: ["lantern-sonnet", "lantern-haiku"],
    },
  ],
  routes: [
    { id: "route-reasoner", alias: "gateway-reasoner", inboundProtocol: "Res", targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-large" }], outboundProtocol: "Chat", enabled: true },
    { id: "route-fast", alias: "gateway-fast", inboundProtocol: "Mes", targets: [{ upstreamId: "up-lantern", upstreamModel: "lantern-haiku" }], outboundProtocol: "Mes", enabled: true },
  ],
  logs: [
    { id: "req-7d3a9f21", time: "2026-11-18 09:42:11", model: "gateway-reasoner", credential: "Desktop client ·••••", upstream: "Northstar AI", reasoning: "high", direction: "Res → Chat → Res", status: "成功（模拟）", durationMs: 842, stream: true, firstTokenMs: 218, tokens: { input: 1248, output: 182, cacheRead: 1024, cacheWrite: 0, total: 1430, reasoning: 64 } },
    { id: "req-29ab10ce", time: "2026-11-18 09:38:04", model: "gateway-fast", credential: "Local test ·••••", upstream: "Lantern Labs", direction: "Mes → Mes → Mes", status: "失败（模拟）", durationMs: 241, stream: true, error: "上游响应超时（示例错误）" },
    { id: "req-1f20cc6b", time: "2026-11-18 09:31:52", model: "gateway-reasoner", credential: "Desktop client ·••••", upstream: "Northstar AI", direction: "Res → Chat → Res", status: "成功（模拟）", durationMs: 1106, stream: false, tokens: { input: 326, output: 98, cacheRead: 0, total: 424 } },
  ],
  credentials: [
    { id: "key-desktop", label: "Desktop client", preview: "cxg_demo_••••••••••••7a2f", scope: "全部模型", createdAt: "2026-11-12", lastUsed: "未使用（示例）", status: "示例" },
    { id: "key-local-test", label: "Local test", preview: "cxg_demo_••••••••••••c910", scope: "gateway-fast", createdAt: "2026-11-15", lastUsed: "未使用（示例）", status: "示例" },
  ],
  settings: [
    { label: "Gateway 监听地址", value: "127.0.0.1", available: false },
    { label: "本机端口", value: "8317", available: false },
    { label: "日志保留期", value: "30 天", available: false },
    { label: "开机启动", value: "关闭", available: false },
  ],
};
