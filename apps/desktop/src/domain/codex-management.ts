export type CodexMode = "direct" | "gateway";
export type CodexSelection =
  | { mode: "direct"; profileId: string; profilesRevision: string }
  | { mode: "gateway"; routeIds: string[]; defaultRouteId: string };
export type CodexDirectStatus = {
  kind: "official" | "custom" | "snapshot";
  name: string;
  providerId?: string;
  baseUrl?: string;
  model?: string;
  profileId?: string;
  importable: boolean;
  warning?: string;
};
export type CodexSearchPolicy = {
  webSearch: "disabled" | "unchanged" | "restored";
  reason?: "converted-upstream";
  activeProfile?: string;
  affectsActiveProfile: boolean;
  externalOverrides?: "not-managed";
};
export type CodexCatalogSync = {
  state: "current" | "stale" | "unavailable" | "not-applied";
  source: "gateway" | "direct" | "none";
  models: { model: string; inputModalities: ("text" | "image")[] }[];
  catalogPath?: string;
};
export type CodexStatus = {
  configScope: "user";
  configPath: string;
  exists: boolean;
  revision: string;
  configured: boolean;
  mode: CodexMode | "unknown";
  direct?: CodexDirectStatus;
  model?: string;
  baseUrl?: string;
  credentialConfigured: boolean;
  selectedRouteIds: string[];
  selectedModelAliases: string[];
  defaultRouteId?: string;
  catalogStatus:
    | "managed"
    | "legacy"
    | "none"
    | "external"
    | "missing"
    | "invalid";
  backup?: { id: string; createdAt: string };
  searchPolicy?: CodexSearchPolicy;
  catalogSync?: CodexCatalogSync;
};
export type CodexPreview = {
  configPath: string;
  revision: string;
  mode: CodexMode;
  model?: string;
  baseUrl?: string;
  providerName?: string;
  changes: string[];
  configPreview: string;
  replacesCurrentProvider: boolean;
  catalogPreview?: string;
  selectedModelAliases: string[];
  searchPolicy?: CodexSearchPolicy;
  catalogRefresh?: "on-explicit-apply";
};
export type CodexApplyInput = CodexSelection & {
  expectedRevision: string;
  clientKey?: string;
  credentialId?: string;
};
export type CodexRestoreInput = { backupId: string; expectedRevision: string };
export type CodexControls = {
  getCodexStatus(): Promise<CodexStatus>;
  previewCodexConfig(input: CodexSelection): Promise<CodexPreview>;
  applyCodexConfig(input: CodexApplyInput): Promise<CodexStatus>;
  restoreCodexConfig(input: CodexRestoreInput): Promise<CodexStatus>;
};
export type CodexDirectProfile = {
  id: string;
  kind: "official" | "custom" | "snapshot";
  name: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
  credentialConfigured: boolean;
  editable: boolean;
  active: boolean;
  updatedAt?: string;
};
export type CodexDirectProfiles = {
  revision: string;
  secureStorageAvailable: boolean;
  profiles: CodexDirectProfile[];
  lastDirectProfileId?: string;
};
export type CodexDirectProfileInput = {
  expectedRevision: string;
  id?: string;
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  apiKey?: string;
};
export type CodexProfilesControls = {
  getCodexDirectProfiles(): Promise<CodexDirectProfiles>;
  saveCodexDirectProfile(
    input: CodexDirectProfileInput,
  ): Promise<CodexDirectProfiles>;
  importCodexDirectProfile(input: {
    expectedRevision: string;
    expectedConfigRevision: string;
    name?: string;
  }): Promise<CodexDirectProfiles>;
  duplicateCodexDirectProfile(input: {
    expectedRevision: string;
    id: string;
    name?: string;
  }): Promise<CodexDirectProfiles>;
  deleteCodexDirectProfile(input: {
    expectedRevision: string;
    id: string;
  }): Promise<CodexDirectProfiles>;
};
export type CodexClientStatus = {
  available: boolean;
  version?: string;
  auth: "chatgpt" | "api" | "signed_out" | "unknown";
  login: "idle" | "pending" | "succeeded" | "failed";
};
export type CodexClientControls = {
  getCodexClientStatus(): Promise<CodexClientStatus>;
  startCodexLogin(input: {
    expectedRevision: string;
  }): Promise<CodexClientStatus>;
  cancelCodexLogin(): Promise<CodexClientStatus>;
};
export type CodexGatewayDraft = {
  routeIds: string[];
  defaultRouteId: string;
  credentialSource: "current" | "stored" | "manual";
  credentialId?: string;
};
export type CodexGatewayPreferences = CodexGatewayDraft & {
  revision: string;
  exists: boolean;
};
export type CodexGatewayCredential = {
  id: string;
  name: string;
  scope: string[];
  enabled: boolean;
  secretAvailable: boolean;
  current: boolean;
};
export type CodexGatewayCredentials = {
  credentials: CodexGatewayCredential[];
  currentCredentialId?: string;
  currentConfigured: boolean;
};
export type CodexGatewayControls = {
  getCodexGatewayPreferences(): Promise<CodexGatewayPreferences>;
  saveCodexGatewayPreferences(
    input: CodexGatewayDraft & { expectedRevision: string },
  ): Promise<CodexGatewayPreferences>;
  getCodexGatewayCredentials(): Promise<CodexGatewayCredentials>;
  retainCodexGatewayCredential(input: {
    id: string;
    key?: string;
    fromCurrent?: boolean;
  }): Promise<CodexGatewayCredentials>;
};
export const codexModeLabel = (mode: CodexStatus["mode"]) =>
  mode === "direct"
    ? "Codex 直连"
    : mode === "gateway"
      ? "CX-RG 网关"
      : "无法识别";
