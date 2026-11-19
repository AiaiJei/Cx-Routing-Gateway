import { WorkspaceState } from "../components/WorkspaceState";
import { Link } from "react-router";
import { EmptyResult, FixtureNotice, PageHeader } from "../components/PageHeader";
import { ProtocolFlow } from "../components/ProtocolBadge";
import { useWorkspace } from "../data/use-workspace";

export function OverviewPage() {
  const { data, error, loading } = useWorkspace();
  const { gateway, upstreams, routes, logs } = data;
  const succeeded = logs.filter((log) => log.status.startsWith("成功")).length;
  const failed = logs.length - succeeded;
  const failedLogs = logs.filter((log) => log.status.startsWith("失败"));
  const timedLogs = logs.filter((log) => log.durationMs !== null);
  const average = timedLogs.length ? Math.round(timedLogs.reduce((total, log) => total + log.durationMs!, 0) / timedLogs.length) : null;
  const metrics = gateway.metrics;

  if (loading || error) return <WorkspaceState title="总览" loading={loading} error={error} />;

  return (
    <div className="page-content">
      <PageHeader title="总览" description="先确认 Gateway 状态，再处理配置和最近调用。" />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时数据" : "示例数据 · 非实时"}</FixtureNotice>
      <section className="overview-hero" aria-labelledby="gateway-status-title">
        <div className="overview-hero-main">
          <h2 id="gateway-status-title" className="section-title">本机 Gateway</h2>
          <p className="status-line"><span className="state-dot" />{data.meta.live ? gateway.state : "运行时未接入"}</p>
          <p className="helper-text">{data.meta.live ? (gateway.state === "运行中" ? "本机 Gateway 已通过 Desktop 生命周期启动。" : "请检查 Gateway 运行状态。") : "浏览器展示示例；在 Desktop 中可查看本机 Gateway 状态。"}</p>
          <div className="endpoint-inline"><span className="field-label">预设本机接入地址</span><code>{gateway.url}</code></div>
        </div>
        <div className="overview-actions" aria-label="快捷操作"><Link to="/upstreams" className="geist-button geist-button--secondary">查看上游</Link><Link to="/routes" className="geist-button geist-button--secondary">查看路由</Link><Link to="/credentials" className="geist-button geist-button--secondary">查看凭证</Link></div>
      </section>
      {failedLogs.length > 0 && <section className="attention-panel" aria-labelledby="attention-title"><div className="section-heading"><div><h2 id="attention-title" className="section-title">需要关注</h2><p className="helper-text">{data.meta.live ? "最近失败调用" : "示例调用中的失败记录"}</p></div><Link to="/logs" className="quiet-link">查看日志</Link></div><div className="attention-list">{failedLogs.map((log) => <div className="attention-row" key={log.id}><span className="attention-mark" aria-hidden="true">!</span><div><strong>{log.model}</strong><span className="cell-subtext">{log.error ?? log.status}</span></div><code>{log.id}</code></div>)}</div></section>}
      <div className="overview-grid">
        <section className="overview-panel" aria-labelledby="ready-title"><div className="section-heading"><div><h2 id="ready-title" className="section-title">配置就绪</h2><p className="helper-text">{data.meta.live ? "当前本机配置" : "当前工作区中的示例配置"}</p></div></div><div className="ready-list"><Link to="/upstreams"><span>上游服务</span><strong>{upstreams.length}</strong></Link><Link to="/routes"><span>模型路由</span><strong>{routes.length}</strong></Link><Link to="/credentials"><span>接入凭证</span><strong>{data.credentials.length}</strong></Link></div></section>
        <section className="overview-panel" aria-labelledby="summary-title"><div className="section-heading"><div><h2 id="summary-title" className="section-title">运行概况</h2><p className="helper-text">{metrics ? "本机运行时指标" : "最近示例调用的摘要"}</p></div></div><div className="metric-tray"><div><span className="metric-label">调用数</span><strong>{metrics?.total ?? logs.length}</strong></div><div><span className="metric-label">成功 / 失败</span><strong>{metrics ? `${metrics.completed} / ${metrics.failed}` : `${succeeded} / ${failed}`}</strong></div><div><span className="metric-label">平均耗时</span><strong>{(metrics?.avgDurationMs ?? average) === null ? "-" : <>{metrics?.avgDurationMs ?? average}<small> ms</small></>}</strong></div></div></section>
      </div>
      <section className="page-section" aria-labelledby="recent-logs-title">
        <div className="section-heading"><h2 id="recent-logs-title" className="section-title">最近调用</h2><Link to="/logs" className="quiet-link">查看日志</Link></div>
        {logs.length ? <div className="table-scroll" role="region" aria-label="最近调用列表" tabIndex={0}><table>
          <thead><tr><th>请求 ID</th><th>模型</th><th>协议方向</th><th>状态</th><th className="numeric">耗时</th></tr></thead>
          <tbody>{logs.slice(0, 3).map((log) => (
            <tr key={log.id}><td><code>{log.id}</code></td><td>{log.model}</td><td><ProtocolFlow value={log.direction} /></td><td><span className={`status-badge ${log.status.startsWith("成功") ? "status-positive" : "status-negative"}`}>{log.status}</span></td><td className="numeric">{log.durationMs === null ? "—" : `${log.durationMs} ms`}</td></tr>
          ))}</tbody>
        </table></div> : <EmptyResult>尚无调用记录</EmptyResult>}
      </section>
    </div>
  );
}
