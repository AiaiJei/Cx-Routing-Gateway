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
});
class CodexConfigError extends Error {
  constructor(code) { super(messages[code] || messages.CODEX_IO_FAILED); this.name = "CodexConfigError"; this.code = code; }
}
function fail(code) { return new CodexConfigError(code); }
function sanitize(error, fallback = "CODEX_IO_FAILED") {
  return error instanceof CodexConfigError ? error : fail(fallback);
}
module.exports = { CodexConfigError, fail, sanitize };
