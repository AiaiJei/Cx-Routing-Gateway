import { useRef, useState } from "react";
import { Link } from "react-router";
import type { WorkspaceFixtures } from "../domain/types";
import { OverviewIcon } from "./OverviewIcon";

export function OverviewRuntimePanel({ data }: { data: WorkspaceFixtures }) {
  const [copyState, setCopyState] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const copyPending = useRef(false);
  const enabledRoutes = data.routes.filter(route => route.enabled).length;
  const activeCredentials = data.credentials.filter(credential => credential.status === "运行时").length;
  const revokedCredentials = data.credentials.filter(credential => credential.status === "已撤销").length;
  const checked = data.upstreams.filter(upstream => upstream.status === "已连接").length;
  const pending = data.upstreams.filter(upstream => upstream.status === "待测试").length;
  const disconnected = data.upstreams.filter(upstream => upstream.status === "未连接").length;
  const gatewayStatus = data.meta.live ? data.gateway.state : "运行时未接入";
  const gatewayTone = !data.meta.live || data.gateway.state === "未接入" ? "warning" : data.gateway.state === "运行中" ? "running" : "failed";

  async function copyAddress() {
    if (copyPending.current) return;
    copyPending.current = true;
    setCopyState("pending");
    try {
      await navigator.clipboard.writeText(data.gateway.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      copyPending.current = false;
    }
  }

  return <section className="local-panel" aria-labelledby="gateway-status-title">
    <div className="side-heading"><OverviewIcon name="gateway" size={40} /><h2 id="gateway-status-title">本机 Gateway</h2></div>
    <p className="overview-status__state gateway-unavailable"><span className={`overview-state-dot overview-state-dot--${gatewayTone}`} aria-hidden="true" />{gatewayStatus}</p>
    <p className="side-help">{!data.meta.live ? "在 Desktop 中查看本机服务状态。" : data.gateway.state === "运行中" ? "本机 Gateway 已通过 Desktop 生命周期启动。" : "请检查 Gateway 运行状态。"}</p>
    <div className="address-field"><code title={data.gateway.url}>{data.gateway.url}</code><button type="button" aria-label="复制本机接入地址" disabled={copyState === "pending"} onClick={() => void copyAddress()}>{copyState === "pending" ? "复制中…" : copyState === "copied" ? "已复制" : "复制"}</button></div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{copyState === "pending" ? "正在复制接入地址" : copyState === "copied" ? "接入地址已复制" : ""}</p>
    {copyState === "failed" && <p role="alert" className="overview-copy-error">复制失败，请手动复制接入地址。</p>}
    <div className="resource-rows">
      <Link to="/upstreams" aria-label="查看上游"><span>上游服务</span><strong>{data.upstreams.length}<span>个</span></strong></Link>
      <div role="group" aria-label="模型路由"><Link to="/routes" aria-label="查看路由"><span>模型路由</span><strong className="overview-status__count">{enabledRoutes} / {data.routes.length}<span className="overview-status__caption">已启用</span></strong></Link></div>
      <div role="group" aria-label="接入凭证"><Link to="/credentials" aria-label="查看凭证"><span>{data.meta.live ? "有效凭证" : "示例凭证"}</span><strong>{data.meta.live ? activeCredentials : data.credentials.length}<span>{data.meta.live ? `${revokedCredentials} 已撤销` : "浏览器预览"}</span></strong></Link></div>
    </div>
    <section className="upstream-checks" aria-labelledby="upstream-status-title">
      <h3 id="upstream-status-title" className="check-caption">上游最近检查</h3>
      <p className="sr-only">最近测试通过 {checked} · 待测试 {pending} · 未连接 {disconnected}</p>
      {data.upstreams.map(upstream => <div className="upstream-check" key={upstream.id}><span>{upstream.name}</span><span className="untested-label">{upstream.status}</span></div>)}
      {!data.upstreams.length && <p className="side-help">尚未配置上游服务。</p>}
      <p className="side-help last-check">仅反映最近一次检查，不代表持续在线。</p>
    </section>
  </section>;
}
