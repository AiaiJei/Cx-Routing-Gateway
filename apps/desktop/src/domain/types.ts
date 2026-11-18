export type Protocol = "Res" | "Mes" | "Chat";
export type FixtureMeta = { source: "fixture"; live: false };

export type Upstream = {
  id: string;
  name: string;
  baseUrl: string;
  outboundProtocol: Protocol;
  credentialLabel: string;
  status: "未连接" | "待测试";
  models: string[];
};

export type ModelRoute = {
  id: string;
  alias: string;
  inboundProtocol: Protocol;
  upstreamId: string;
  upstreamModel: string;
  outboundProtocol: Protocol;
  enabled: boolean;
};

export type CallLog = {
  id: string;
  time: string;
  model: string;
  credential: string;
  upstream: string;
  direction: string;
  status: "成功（模拟）" | "失败（模拟）";
  durationMs: number;
  error?: string;
};

export type AccessCredential = {
  id: string;
  label: string;
  preview: string;
  scope: string;
  createdAt: string;
  lastUsed: string;
  status: "示例";
};

export type WorkspaceFixtures = {
  meta: FixtureMeta;
  gateway: { state: "未接入"; url: "http://127.0.0.1:8317" };
  upstreams: Upstream[];
  routes: ModelRoute[];
  logs: CallLog[];
  credentials: AccessCredential[];
  settings: { label: string; value: string; available: boolean }[];
};
