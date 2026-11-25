export type CodexReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type CodexStatus = {
  configPath: string;
  exists: boolean;
  revision: string;
  configured: boolean;
  model?: string;
  baseUrl?: string;
  reasoningEffort?: string;
  credentialConfigured: boolean;
  backup?: { id: string; createdAt: string };
};

export type CodexSelection = { routeId: string; reasoningEffort?: CodexReasoningEffort };
export type CodexPreview = {
  configPath: string;
  revision: string;
  model: string;
  baseUrl: string;
  configPreview: string;
  replacesCurrentProvider: boolean;
};
export type CodexApplyInput = CodexSelection & { clientKey: string; expectedRevision: string };
export type CodexRestoreInput = { backupId: string; expectedRevision: string };

export type CodexControls = {
  getCodexStatus(): Promise<CodexStatus>;
  previewCodexConfig(input: CodexSelection): Promise<CodexPreview>;
  applyCodexConfig(input: CodexApplyInput): Promise<CodexStatus>;
  restoreCodexConfig(input: CodexRestoreInput): Promise<CodexStatus>;
};
