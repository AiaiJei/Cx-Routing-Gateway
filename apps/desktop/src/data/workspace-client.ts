import { finiteMetric, sanitizeTokens } from '../domain/request-log';
import { workspaceFixtures } from "./fixtures";
import type { RouteTestResult, WorkspaceFixtures } from "../domain/types";

export type WorkspaceClient = {
  getWorkspace(): Promise<WorkspaceFixtures>;
  simulateUpstreamTest(upstreamId: string): Promise<{ simulated: boolean; message: string }>;
  testRoute?(routeId: string, prompt: string): Promise<RouteTestResult>;
  createClientKey?(name: string, scope?: string[]): Promise<{ id: string; key: string }>;
  rotateClientKey?(id: string): Promise<{ key: string }>;
  revokeClientKey?(id: string): Promise<{ enabled: boolean }>;
  createUpstream?(input: { name: string; baseUrl: string; apiKey?: string; allowPrivateNetwork?: boolean }): Promise<unknown>;
  deleteUpstream?(id: string): Promise<unknown>;
  saveModelRoutes?(selection: import("../domain/types").ModelRouteSelection): Promise<unknown>;
  createRoute?(input: { alias: string; inboundProtocol: string; outboundProtocol: string; upstreamId: string; modelId: string }): Promise<unknown>;
  deleteRoute?(id: string): Promise<unknown>;
  updateRoute?(id: string, input: { alias?: string; inboundProtocol?: string; outboundProtocol?: string; upstreamId?: string; modelId?: string; enabled?: boolean }): Promise<unknown>;
  updateSettings?(input: { usageRetentionCount: number }): Promise<unknown>;
};

export const fixtureWorkspaceClient: WorkspaceClient = {
  async getWorkspace() {
    return structuredClone(workspaceFixtures);
  },
  async simulateUpstreamTest(upstreamId) {
    const upstream = workspaceFixtures.upstreams.find((item) => item.id === upstreamId);
    if (!upstream) throw new Error("找不到该上游服务");
    return { simulated: true, message: `${upstream.name}：连通测试未执行，当前仅为界面演示` };
  },
  async testRoute() {
    throw new Error("真实请求仅可在 Desktop 本机运行时发起。");
  },
};

export function mapRuntimeState(state: any): WorkspaceFixtures {
  const protocol = (value: string) => value as WorkspaceFixtures["routes"][number]["inboundProtocol"];
  const upstreamNames = new Map((Array.isArray(state.upstreams) ? state.upstreams : []).map((item: any) => [item.id, item.name]));
  return {
    meta: { source: "runtime", live: true },
    gateway: { state: state.runtimeStatus?.state === "failed" ? "启动失败" : "运行中", url: `http://${state.settings.gatewayHost}:${state.settings.gatewayPort}`, metrics: state.metrics },
    upstreams: state.upstreams.map((item: any) => ({ id: item.id, name: item.name, baseUrl: item.baseUrl, credentialLabel: item.credentialRef ? "已配置（已脱敏）" : "未配置", status: (item.lastCheckedAt ? "已连接" : item.enabled ? "待测试" : "未连接") as WorkspaceFixtures["upstreams"][number]["status"], models: item.models || [] })),
    routes: state.routes.map((item: any) => ({ id: item.id, alias: item.alias, inboundProtocol: protocol(item.inboundProtocol), outboundProtocol: protocol(item.outboundProtocol), enabled: item.enabled, failover: item.failover, targets: (item.targets?.length ? item.targets : [{ upstreamId: item.upstreamId, modelId: item.modelId }]).map((target: any) => ({ upstreamId: target.upstreamId, upstreamModel: target.modelId })) })),
    logs: (state.usage || []).map((item: any) => ({ id: item.requestId, time: item.createdAt, model: item.modelId, credential: "已脱敏", upstream: item.upstreamName || upstreamNames.get(item.upstreamId) || "—", direction: `${item.inboundProtocol ?? "—"} → ${item.outboundProtocol ?? "—"} → ${item.inboundProtocol ?? "—"}`, status: (item.status === "completed" ? "成功" : "失败") as WorkspaceFixtures["logs"][number]["status"], durationMs: finiteMetric(item.durationMs) ?? null, stream: typeof item.stream === "boolean" ? item.stream : undefined, firstTokenMs: finiteMetric(item.firstTokenMs), tokens: sanitizeTokens(item.tokens) })),
    credentials: state.clientKeys.map((item: any) => ({ id: item.id, label: item.name, preview: "cxrg_••••••••", scope: item.scope?.length ? item.scope.join(", ") : "全部模型", createdAt: item.createdAt.slice(0, 10), lastUsed: item.enabled ? (item.lastUsedAt || "暂无记录") : "已撤销", status: item.enabled ? "运行时" as const : "已撤销" as const })),
    settings: [{ label: "Gateway 监听地址", value: state.settings.gatewayHost, available: true }, { label: "本机端口", value: String(state.settings.gatewayPort), available: true }, { label: "日志保留条数", value: `${state.settings.usageRetentionCount ?? 1000} 条`, available: true }, { label: "开机启动", value: "关闭", available: false }],
  };
}

export const runtimeWorkspaceClient: WorkspaceClient = {
  async getWorkspace() {
    if (!window.desktopControls) throw new Error("Desktop runtime unavailable");
    return mapRuntimeState(await window.desktopControls.getWorkspace());
  },
  async simulateUpstreamTest(upstreamId) {
    if (!window.desktopControls) throw new Error("Desktop runtime unavailable");
    const result = await window.desktopControls.testUpstream(upstreamId) as { ok: boolean; models?: string[] };
    return { simulated: false, message: result.ok ? `连通成功，发现 ${(result.models || []).length} 个模型` : "连通测试失败" };
  },
  async testRoute(routeId, prompt) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.testRoute(routeId, prompt); },
  async createClientKey(name, scope) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.createClientKey(name, scope) as Promise<{ id: string; key: string }>; },
  async rotateClientKey(id) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.rotateClientKey(id) as Promise<{ key: string }>; },
  async revokeClientKey(id) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.revokeClientKey(id) as Promise<{ enabled: boolean }>; },
  async createUpstream(input) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.createUpstream(input); },
  async deleteUpstream(id) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.deleteUpstream(id); },
  async saveModelRoutes(selection) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.saveModelRoutes(selection); },
  async createRoute(input) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.createRoute(input); },
  async deleteRoute(id) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.deleteRoute(id); },
  async updateRoute(id, input) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.updateRoute(id, input); },
  async updateSettings(input) { if (!window.desktopControls) throw new Error("Desktop runtime unavailable"); return window.desktopControls.updateSettings(input); },
};

export const defaultWorkspaceClient: WorkspaceClient = typeof window !== "undefined" && window.desktopControls?.getWorkspace ? runtimeWorkspaceClient : fixtureWorkspaceClient;
