import type {
  CodexClientControls,
  CodexControls,
  CodexProfilesControls,
  CodexGatewayControls,
} from "../domain/codex-management";
export function getCodexGatewayControls(): CodexGatewayControls | undefined {
  const controls = window.desktopControls;
  if (
    !controls ||
    typeof controls.getCodexGatewayPreferences !== "function" ||
    typeof controls.saveCodexGatewayPreferences !== "function" ||
    typeof controls.getCodexGatewayCredentials !== "function" ||
    typeof controls.retainCodexGatewayCredential !== "function"
  )
    return undefined;
  return controls as CodexGatewayControls;
}
export function getCodexPreferencesControls():
  | Pick<
      CodexGatewayControls,
      "getCodexGatewayPreferences" | "saveCodexGatewayPreferences"
    >
  | undefined {
  const controls = window.desktopControls;
  if (
    !controls ||
    typeof controls.getCodexGatewayPreferences !== "function" ||
    typeof controls.saveCodexGatewayPreferences !== "function"
  )
    return undefined;
  return controls as CodexGatewayControls;
}

export function getCodexControls(): CodexControls | undefined {
  const controls = window.desktopControls;
  if (
    !controls ||
    typeof controls.getCodexStatus !== "function" ||
    typeof controls.previewCodexConfig !== "function" ||
    typeof controls.applyCodexConfig !== "function" ||
    typeof controls.restoreCodexConfig !== "function"
  )
    return undefined;
  return controls as CodexControls;
}

export function getCodexClientControls(): CodexClientControls | undefined {
  const controls = window.desktopControls;
  if (
    !controls ||
    typeof controls.getCodexClientStatus !== "function" ||
    typeof controls.startCodexLogin !== "function" ||
    typeof controls.cancelCodexLogin !== "function"
  )
    return undefined;
  return controls as CodexClientControls;
}
export function getCodexProfilesControls(): CodexProfilesControls | undefined {
  const controls = window.desktopControls;
  if (
    !controls ||
    typeof controls.getCodexDirectProfiles !== "function" ||
    typeof controls.saveCodexDirectProfile !== "function" ||
    typeof controls.importCodexDirectProfile !== "function" ||
    typeof controls.duplicateCodexDirectProfile !== "function" ||
    typeof controls.deleteCodexDirectProfile !== "function"
  )
    return undefined;
  return controls as CodexProfilesControls;
}

const errors: Record<string, string> = {
  CODEX_PREFERENCES_INVALID:
    "已记住的网关草稿损坏，未覆盖原文件，请检查或重试读取。",
  CODEX_PREFERENCES_CHANGED: "网关草稿已被其他操作修改，请重新读取后重试。",
  CODEX_CREDENTIAL_UNAVAILABLE:
    "所选凭证不可用、已撤销或未保存原文，请重新选择或补录原 Key。",
  CODEX_CREDENTIAL_MISMATCH: "原 Key 与所选凭证不匹配，请核对后重试。",
  CODEX_INPUT_INVALID: "参数无效，请检查路由和凭证。",
  CODEX_CONFIG_CHANGED: "配置已被其他程序修改，请刷新状态并重新预览。",
  CODEX_CONFIG_INVALID: "配置不是可读取的 TOML，请先修正原文件。",
  CODEX_CONFIG_UNSUPPORTED:
    "当前配置结构暂不支持安全修改，请手动整理后重新预览。",
  CODEX_CONFIG_TOO_LARGE: "配置文件过大，请检查原文件。",
  CODEX_PATH_UNSAFE: "配置或备份路径不安全，请检查文件类型。",
  CODEX_BACKUP_INVALID: "备份无法验证，已停止恢复。",
  CODEX_IO_FAILED: "无法读写配置文件，请检查文件权限后重试。",
  CODEX_ROUTE_UNAVAILABLE: "该路由当前不可用，请检查模型路由和上游服务。",
  CODEX_RUNTIME_UNAVAILABLE: "本机 Gateway 尚未就绪，请稍后重试。",
  CODEX_KEY_REJECTED: "客户端 Key 无效或不允许访问所选模型。",
  CODEX_CATALOG_INVALID: "模型目录无法验证，请重新预览并应用。",
  CODEX_LOGIN_PENDING: "已有登录正在进行，请在浏览器完成或取消本次登录。",
  CODEX_LOGIN_MODE_REQUIRED: "请先启用官方默认直连方案，再登录 ChatGPT。",
  CODEX_CLI_NOT_FOUND: "未找到官方 Codex CLI，请安装后重试。",
  CODEX_LOGIN_FAILED: "官方 Codex 登录未完成，请重试或在官方客户端登录。",
  CODEX_CLIENT_DISPOSED: "Codex 登录管理已停止，请重新打开应用。",
  CODEX_PROFILES_UNAVAILABLE: "安全存储不可用，无法保存含凭证的直连方案。",
  CODEX_PROFILES_INVALID: "直连方案库损坏或无法解密，请检查后重试。",
  CODEX_PROFILES_CHANGED: "直连方案库已被其他操作修改，请刷新方案后重试。",
  CODEX_PROFILE_NOT_FOUND: "所选直连方案不存在，请重新选择。",
  CODEX_PROFILE_IN_USE:
    "该直连方案正在使用或保留为最近直连，请先启用另一个方案。",
  CODEX_PROFILE_LIMIT: "直连方案已达到 50 个上限，请整理后重试。",
  CODEX_DIRECT_AUTH_UNSAFE:
    "当前第三方路由可能回退使用官方账户凭证，请先为供应商配置独立 Key 或认证环境变量。",
};

// Electron may retain the stable code only in Error.message; never echo arbitrary contents.
export function codexErrorMessage(error: unknown, fallback: string): string {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  if (code && errors[code]) return errors[code];
  const message = error instanceof Error ? error.message : "";
  const knownCode = message.match(/\bCODEX_[A-Z_]+\b/)?.[0];
  return knownCode && errors[knownCode] ? errors[knownCode] : fallback;
}
