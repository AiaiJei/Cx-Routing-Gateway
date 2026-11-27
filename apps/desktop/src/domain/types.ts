export type Protocol = "Res" | "Mes" | "Chat";
export type FixtureMeta = { source: "fixture" | "runtime"; live: boolean };

export type Upstream = {
  id: string;
  name: string;
  baseUrl: string;
  credentialLabel: string;
  status: "未连接" | "待测试" | "已连接";
  models: string[];
};

export type UpstreamUpdateInput = Pick<Upstream, "name" | "baseUrl"> & { apiKey?: string };

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ReasoningRange = { min: ReasoningEffort; max: ReasoningEffort };
export type ModelCapabilities = {
  contextWindow?: number;
  maxOutputTokens?: number;
  inputModalities?: ("text" | "image")[];
  reasoningEfforts?: ReasoningEffort[];
  tools?: boolean;
};

export type ModelRouteSelection = {
  inboundProtocol: Protocol;
  outboundProtocol: Protocol;
  targets: { upstreamId: string; modelId: string }[];
  editId?: string;
  replaceTargets?: boolean;
  modelReasoning?: ({ modelId: string } & (ReasoningRange | { clear: true }))[];
  modelCapabilities?: { modelId: string; capabilities: ModelCapabilities | null }[];
  failover?: { failureThreshold: number; statusClasses: number[] };
};

export type ModelRoute = {
  id: string;
  alias: string;
  inboundProtocol: Protocol;
  targets: { upstreamId: string; upstreamModel: string }[];
  outboundProtocol: Protocol;
  enabled: boolean;
  reasoning?: ReasoningRange;
  capabilities?: ModelCapabilities;
  failover?: { failureThreshold: number; statusClasses: number[]; cooldownSeconds?: number };
};

export type RequestTokens = Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'total' | 'reasoning' | 'inputAudio' | 'outputAudio' | 'cacheWrite5m' | 'cacheWrite1h', number>>;

export type StreamFailurePhase = "upstream_headers" | "upstream_body" | "downstream_closed";

export type CallLog = {
  id: string;
  time: string;
  model: string;
  credential: string;
  upstream: string;
  reasoning?: string;
  httpStatus?: number;
  upstreamStatus?: number;
  gatewayStatus?: number;
  streamFailurePhase?: StreamFailurePhase;
  direction: string;
  status: "成功（模拟）" | "失败（模拟）" | "成功" | "失败";
  durationMs: number | null;
  stream?: boolean;
  firstTokenMs?: number;
  upstreamHeadersMs?: number;
  upstreamFirstByteMs?: number;
  upstreamBodyMs?: number;
  upstreamChunkCount?: number;
  gatewayProcessingMs?: number;
  tokens?: RequestTokens;
  error?: string;
};

export type RouteTestResult = {
  routeAlias: string;
  text: string;
  requestId: string;
  durationMs: number;
  status: number;
  error?: string;
};

export type AccessCredential = {
  id: string;
  label: string;
  preview: string;
  scope: string;
  createdAt: string;
  lastUsed: string;
  status: "示例" | "运行时" | "已撤销";
};

export type WorkspaceFixtures = {
  meta: FixtureMeta;
  usageRetentionCount?: number;
  gateway: { state: "未接入" | "运行中" | "启动失败"; url: string; metrics?: { total: number; completed: number; rejected: number; failed: number; avgDurationMs: number | null } };
  upstreams: Upstream[];
  routes: ModelRoute[];
  logs: CallLog[];
  credentials: AccessCredential[];
  settings: { label: string; value: string; available: boolean }[];
};
