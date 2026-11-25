import { Button } from "./Button";
import type { CodexStatus } from "../domain/codex-management";

export function CodexStatusPanel({ status, available, loading, busy, onRestore }: {
  status: CodexStatus | null; available: boolean; loading: boolean; busy: boolean; onRestore: () => void;
}) {
  return <section className="codex-current" aria-labelledby="codex-current-title">
    <div className="codex-current-heading">
      <h2 id="codex-current-title" className="section-title">当前配置</h2>
      <span className={`status-badge ${status?.configured ? "status-positive" : "status-neutral"}`}>
        {!available ? "本机状态未读取" : loading ? "读取中…" : !status ? "无法读取" : status.configured ? "已指向 Gateway" : "尚未指向 Gateway"}
      </span>
    </div>
    {status ? <>
      <p className="codex-path"><span>配置文件</span><code>{status.configPath}</code>{!status.exists && <span>首次应用时创建</span>}</p>
      <dl className="codex-current-values">
        <div><dt>模型</dt><dd>{status.model || "未设置"}</dd></div>
        <div><dt>推理强度</dt><dd>{status.reasoningEffort || "使用 Codex 默认值"}</dd></div>
        <div><dt>Gateway 凭证</dt><dd>{status.credentialConfigured ? "已配置（已脱敏）" : "未配置"}</dd></div>
      </dl>
      {status.baseUrl && <p className="codex-path"><span>Gateway</span><code>{status.baseUrl}</code></p>}
      <div className="codex-backup">
        <p>{status.backup ? <>最近备份 <time dateTime={status.backup.createdAt}>{formatBackupDate(status.backup.createdAt)}</time></> : "还没有由本页创建的备份"}</p>
        <Button size="small" disabled={!status.backup || busy} onClick={onRestore}>恢复备份</Button>
      </div>
    </> : <p className="helper-text">{available ? "读取本机配置后，可预览并确认新的路由设置。" : "在 Desktop 中打开此页，可读取配置、应用路由并恢复备份。"}</p>}
  </section>;
}

function formatBackupDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "时间未知";
}
