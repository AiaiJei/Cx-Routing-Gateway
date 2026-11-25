import type { CodexControls } from "../domain/codex-management";

export function getCodexControls(): CodexControls | undefined {
  const controls = window.desktopControls;
  if (!controls || typeof controls.getCodexStatus !== "function" || typeof controls.previewCodexConfig !== "function" ||
      typeof controls.applyCodexConfig !== "function" || typeof controls.restoreCodexConfig !== "function") return undefined;
  return controls as CodexControls;
}

const errors: Record<string, string> = {
  CODEX_INPUT_INVALID: "参数无效，请检查路由和凭证。",
  CODEX_CONFIG_CHANGED: "配置已被其他程序修改，请刷新状态并重新预览。",
  CODEX_CONFIG_INVALID: "配置不是可读取的 TOML，请先修正原文件。",
  CODEX_CONFIG_UNSUPPORTED: "当前配置结构暂不支持安全修改，请手动整理后重新预览。",
  CODEX_CONFIG_TOO_LARGE: "配置文件过大，请检查原文件。",
  CODEX_PATH_UNSAFE: "配置或备份路径不安全，请检查文件类型。",
  CODEX_BACKUP_INVALID: "备份无法验证，已停止恢复。",
  CODEX_IO_FAILED: "无法读写配置文件，请检查文件权限后重试。",
  CODEX_ROUTE_UNAVAILABLE: "该路由当前不可用，请检查模型路由和上游服务。",
  CODEX_RUNTIME_UNAVAILABLE: "本机 Gateway 尚未就绪，请稍后重试。",
  CODEX_KEY_REJECTED: "客户端 Key 无效或不允许访问所选模型。",
};

// Electron may retain the stable code only in Error.message; never echo arbitrary contents.
export function codexErrorMessage(error: unknown, fallback: string): string {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  if (code && errors[code]) return errors[code];
  const message = error instanceof Error ? error.message : "";
  const knownCode = message.match(/\bCODEX_[A-Z_]+\b/)?.[0];
  return knownCode && errors[knownCode] ? errors[knownCode] : fallback;
}
