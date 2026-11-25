import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { WorkspaceState } from "../components/WorkspaceState";
import { Button } from "../components/Button";
import { CustomSelect } from "../components/CustomSelect";
import { TextField } from "../components/TextField";
import { Modal } from "../components/Modal";
import { CodexStatusPanel } from "../components/CodexStatusPanel";
import { useWorkspace } from "../data/use-workspace";
import { useCodexManagement } from "../data/codex-management";
import { defaultWorkspaceClient } from "../data/workspace-client";
import "../styles/codex.css";

export function CodexPage() {
  const { data, loading, error, refresh, refreshing, refreshError } = useWorkspace();
  const [routeId, setRouteId] = useState("");
  const routes = data.routes.filter(route => route.enabled && route.inboundProtocol === "Res");
  const route = routes.find(item => item.id === routeId);
  const management = useCodexManagement(!loading && !error && data.meta.live, route, refreshing || !!refreshError);
  const { available, status, preview, reasoning, clientKey, keyScope, busy, confirmation, message, error: actionError } = management;
  const routeSignature = JSON.stringify([route, data.gateway.url]);
  const previousRoute = useRef(routeSignature);
  useEffect(() => {
    if (previousRoute.current !== routeSignature) management.invalidate();
    previousRoute.current = routeSignature;
  }, [routeSignature, management.invalidate]);
  const locked = refreshing || busy === "apply" || busy === "restore" || busy === "create" || !!confirmation;
  const ready = available && !!status && busy !== "status" && !refreshing && !refreshError;
  const keyMatchesRoute = !keyScope || keyScope === route?.alias;
  const upstreamNames = [...new Set(route?.targets.map(target => data.upstreams.find(item => item.id === target.upstreamId)?.name || "上游已移除") || [])];

  if (loading || error) return <WorkspaceState title="Codex 路由与管理" loading={loading} error={error} />;

  return (
    <div className="page-content codex-page">
      <PageHeader title="Codex 路由与管理" description="为 Codex 的下一次会话选择 Gateway 模型路由。" action={
        <Button disabled={!available || !!busy || !!confirmation || refreshing} onClick={() => { refresh(); void management.refreshStatus(); }}>{busy === "status" || refreshing ? "读取中…" : "刷新状态"}</Button>
      } />
      <FixtureNotice live={available}>{available ? "本机配置 · 仅在确认后写入" : data.meta.live ? "当前 Desktop 尚未提供 Codex 配置管理，请更新应用后重试。" : "浏览器预览 · 不读取本机 Codex 配置，不能应用、恢复或创建 Key。"}</FixtureNotice>
      {actionError && <p className="codex-feedback codex-feedback-error" role="alert">{actionError}</p>}
      {refreshError && <p className="codex-feedback codex-feedback-error" role="alert">工作区刷新失败，请刷新状态后重试。</p>}
      {message && <p className="codex-feedback" role="status">{message}</p>}
      <CodexStatusPanel status={status} available={available} loading={busy === "status" || refreshing} busy={!!busy || !!confirmation || refreshing || !!refreshError} onRestore={() => management.setConfirmation("restore")} />
      <div className="codex-workspace">
        <section className="codex-setup" aria-labelledby="codex-setup-title">
          <h2 id="codex-setup-title" className="section-title">接入设置</h2>
          <p className="helper-text">仅显示已启用、以 Responses 协议接入的模型路由。</p>
          <fieldset className="codex-fields" disabled={locked}>
            <div className="geist-field"><span className="geist-field-label" id="codex-route-label">Codex 模型路由</span>
              <CustomSelect ariaLabel="Codex 模型路由" value={routeId} onChange={value => { management.invalidate(); setRouteId(value); }} options={routes.map(item => ({ value: item.id, label: item.alias }))} placeholder="选择模型路由" emptyMessage="暂无可用的 Responses 路由" />
            </div>
            {route ? <div className="codex-route-summary"><strong>{upstreamNames.join("、")}</strong><span>Res → {route.outboundProtocol} → Res</span><code>{data.gateway.url}/v1</code></div>
              : <p className="codex-route-empty">{routes.length ? "选择路由后，可查看转发目标与接入地址。" : "还没有可用的 Responses 路由，请先在模型路由页面添加。"}</p>}
            <div className="geist-field"><span className="geist-field-label">推理强度</span>
              <CustomSelect ariaLabel="推理强度" value={reasoning} onChange={management.changeReasoning} options={[{ value: "", label: "保持当前设置" }, "none", "minimal", "low", "medium", "high", "xhigh"]} />
              <span className="geist-field-hint">可用强度由所选模型决定；保持当前设置会保留原配置。</span>
            </div>
            <TextField label="Gateway 客户端 Key" type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={clientKey} onChange={event => management.changeClientKey(event.target.value)} disabled={!ready || locked} placeholder="填入已有客户端 Key" hint="使用接入凭证中的客户端 Key，不是上游服务的 API Key。" />
            {keyScope && <p className="helper-text">本页创建的 Key 仅允许访问 {keyScope}。{!keyMatchesRoute && "请选回该模型，或更换客户端 Key。"}</p>}
            <div className="codex-key-action"><Button size="small" disabled={!ready || !route || !!busy || !defaultWorkspaceClient.createClientKey} onClick={() => management.setConfirmation("create")}>创建专用 Key</Button><span className="helper-text">仅授权所选模型</span></div>
          </fieldset>
        </section>
        <section className="codex-preview" aria-labelledby="codex-preview-title">
          <div className="codex-preview-heading"><h2 id="codex-preview-title" className="section-title">配置预览</h2><span className="helper-text">凭证已脱敏</span></div>
          {preview ? <>
            <p className="codex-preview-target">将使用 <strong>{preview.model}</strong>{preview.replacesCurrentProvider ? "，并切换当前提供商。" : "。"}</p>
            <code className="codex-preview-path">{preview.configPath}</code>
            <pre tabIndex={0} aria-label="脱敏配置预览"><code>{preview.configPreview}</code></pre>
          </> : <div className="codex-preview-empty"><p>{busy === "preview" ? "正在生成预览…" : "预览后再应用"}</p><span>读取当前文件版本，核对模型与地址；预览不会保存任何配置。</span></div>}
          <div className="codex-preview-actions">
            <Button disabled={!ready || !route || !!busy || !!confirmation} onClick={() => void management.requestPreview()}>{busy === "preview" ? "预览中…" : "预览配置"}</Button>
            <Button variant="primary" disabled={!ready || !preview || !route || !clientKey.trim() || !keyMatchesRoute || !!busy || !!confirmation} onClick={() => management.setConfirmation("apply")}>应用配置</Button>
          </div>
          <p className="helper-text">应用前验证本机 Gateway 和 Key，不会发起模型生成请求。</p>
        </section>
      </div>
      <footer className="codex-help">
        <p>保存仅更新配置文件。请重启 Codex 并开启新会话确认接入；项目配置和启动参数可能覆盖此处设置。</p>
        <details><summary>文件、凭证与恢复说明</summary><p>应用会切换当前模型和提供商，并将客户端 Key 以明文保存到 Codex 配置文件。历史备份也可能包含 Key。仅更新接入字段，其他内容保留；原文件会完整备份。恢复前会检查文件版本和备份完整性，不会覆盖后来手动修改的内容。</p><p>不会改动 auth.json、登录状态或系统环境变量。目标目录取自 Gateway Desktop 的 CODEX_HOME，未设置时使用用户的 .codex 目录。官方更推荐通过 env_key 从环境变量提供凭证，可选择手动配置。</p></details>
        <nav className="codex-management-links" aria-label="现有 Gateway 管理页面"><Link to="/routes">模型路由</Link><Link to="/upstreams">上游服务</Link><Link to="/credentials">接入凭证</Link></nav>
      </footer>
      {confirmation && <Modal title={confirmation === "apply" ? "确认应用 Codex 配置" : confirmation === "restore" ? "确认恢复 Codex 配置" : "创建 Codex 专用 Key"} onClose={() => management.setConfirmation(null)} canClose={!busy}>
        {confirmation === "apply" ? <><p>将把 Codex 模型切换为 <strong>{preview?.model}</strong>，并使用 Cx-Routing Gateway 提供商。</p><p>客户端 Key 将以明文保存到配置文件，历史备份也可能包含 Key。仅更新接入字段，其他内容保留；原文件会完整备份。</p><p>保存后需重启 Codex 并开启新会话。已有会话不会因此切换。</p></>
          : confirmation === "restore" ? <><p>将恢复最近一次应用前的原始配置；若原来没有配置文件，将恢复为不存在的状态。</p><p>文件若已被其他程序修改，或备份完整性检查失败，恢复会停止。</p></>
          : <><p>将创建仅允许访问 <strong>{route?.alias}</strong> 的 Gateway 客户端 Key，并填入本页。</p><p>Key 保存在本页内存中。离开页面前请应用配置，否则需到接入凭证页面撤销后重新创建。</p></>}
        <div className="form-actions"><Button disabled={!!busy} onClick={() => management.setConfirmation(null)}>取消</Button><Button variant="primary" disabled={!!busy} onClick={() => void management.confirmAction()}>{busy ? "处理中…" : confirmation === "apply" ? "确认应用" : confirmation === "restore" ? "确认恢复" : "确认创建"}</Button></div>
      </Modal>}
    </div>
  );
}
