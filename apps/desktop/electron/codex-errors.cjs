const messages = Object.freeze({
  CODEX_INPUT_INVALID: "Codex 接入参数无效，请检查路由、Key 和配置版本。",
  CODEX_CONFIG_CHANGED: "Codex 配置已被其他程序修改，请刷新并重新预览。",
  CODEX_CONFIG_INVALID: "Codex 配置不是可读取的 TOML，请先修正原文件。",
  CODEX_CONFIG_UNSUPPORTED: "Codex 配置的表结构暂不支持安全修改，请手动整理后重新预览。",
  CODEX_CONFIG_TOO_LARGE: "Codex 配置文件过大，暂时无法安全处理。",
  CODEX_PATH_UNSAFE: "Codex 配置或备份位置不是普通文件目录，已停止操作。",
  CODEX_BACKUP_INVALID: "Codex 备份缺失或校验失败，已停止恢复。",
  CODEX_IO_FAILED: "无法安全读写 Codex 配置，请检查文件权限后重试。",
  CODEX_ROUTE_UNAVAILABLE: "所选路由当前不可用，请刷新并选择启用的 Responses 路由。",
  CODEX_RUNTIME_UNAVAILABLE: "本机 Gateway 尚未就绪，请稍后重试。",
  CODEX_KEY_REJECTED: "Gateway 未接受此 Key，或该 Key 无权访问所选模型。",
  CODEX_CATALOG_INVALID: "模型目录校验失败，已停止修改配置。",
  CODEX_PROFILES_UNAVAILABLE: "系统安全存储不可用，无法保存或使用包含凭证的直连方案。",
  CODEX_PROFILES_INVALID: "直连方案库无法验证，请检查本机加密存储。",
  CODEX_PROFILES_CHANGED: "直连方案已被修改，请刷新方案列表后重试。",
  CODEX_PROFILE_NOT_FOUND: "找不到所选直连方案，请刷新后重试。",
  CODEX_PROFILE_IN_USE: "当前方案仍在使用或作为上次直连保留，请先启用其他方案。",
  CODEX_PROFILE_LIMIT: "直连方案库已达到容量上限，请先删除未使用的方案。",
  CODEX_DIRECT_AUTH_UNSAFE: "当前第三方路由可能回退使用官方账户凭证，请先为供应商配置独立 Key 或认证环境变量。",
  CODEX_PREFERENCES_CHANGED: "本机 Gateway 选择已被修改，请刷新后重试。",
  CODEX_PREFERENCES_INVALID: "本机 Gateway 选择记忆文件无法验证，请检查后重试。",
  CODEX_CREDENTIAL_UNAVAILABLE: "所选接入凭证不可用、已撤销或尚未保存原 Key。",
  CODEX_CREDENTIAL_MISMATCH: "提供的原 Key 与所选凭证不匹配，请检查后重试。",
  CODEX_LOGIN_MODE_REQUIRED: "请先保存官方直登模式，再启动 Codex 登录。",
  CODEX_CLI_NOT_FOUND: "未找到已安装的官方 Codex CLI，请安装后重试。",
  CODEX_LOGIN_PENDING: "Codex 登录正在进行，请先完成或取消当前登录。",
  CODEX_LOGIN_FAILED: "Codex 登录未完成，请在官方客户端确认后重试。",
  CODEX_CLIENT_DISPOSED: "Codex 客户端管理已停止，请重新打开应用。",
});
class CodexConfigError extends Error {
  constructor(code) { super(messages[code] || messages.CODEX_IO_FAILED); this.name = "CodexConfigError"; this.code = code; }
}
function fail(code) { return new CodexConfigError(code); }
function sanitize(error, fallback = "CODEX_IO_FAILED") {
  return error instanceof CodexConfigError ? error : fail(fallback);
}
module.exports = { CodexConfigError, fail, sanitize };
