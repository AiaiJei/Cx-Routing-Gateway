import { Link } from "react-router";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { useWorkspace } from "../data/use-workspace";

export function OverviewPage() {
  const { data, error } = useWorkspace();
  const { gateway, upstreams, routes, logs } = data;
  const succeeded = logs.filter((log) => log.status.startsWith("成功")).length;
  const failed = logs.length - succeeded;
  const failedLogs = logs.filter((log) => log.status.startsWith("失败"));
  const average = logs.length ? Math.round(logs.reduce((total, log) => total + log.durationMs, 0) / logs.length) : null;

  return (
    <div className="page-content">
      <PageHeader title="总览" description="先确认 Gateway 状态，再处理配置和最近调用。" />
      <FixtureNotice />
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <section className="overview-hero" aria-labelledby="gateway-status-title">
        <div className="overview-hero-main">
          <h2 id="gateway-status-title" className="section-title">本机 Gateway</h2>
          <p className="status-line"><span className="state-dot" />运行时未接入</p>
          <p className="helper-text">打开 Desktop 后的自动启动流程尚未实现。</p>
          <div className="endpoint-inline"><span className="field-label">预设本机接入地址</span><code>{gateway.url}</code></div>
        </div>
        <div className="overview-actions" aria-label="快捷操作"><Link to="/upstreams" className="button-secondary">查看上游</Link><Link to="/routes" className="button-secondary">查看路由</Link><Link to="/credentials" className="button-secondary">查看凭证</Link></div>
      </section>
      {failedLogs.length > 0 && <section className="attention-panel" aria-labelledby="attention-title"><div className="section-heading"><div><h2 id="attention-title" className="section-title">需要关注</h2><p className="helper-text">示例调用中的失败记录</p></div><Link to="/logs" className="quiet-link">查看日志</Link></div><div className="attention-list">{failedLogs.map((log) => <div className="attention-row" key={log.id}><span className="attention-mark" aria-hidden="true">!</span><div><strong>{log.model}</strong><span className="cell-subtext">{log.error ?? log.status}</span></div><code>{log.id}</code></div>)}</div></section>}
      <div className="overview-grid">
        <section className="overview-panel" aria-labelledby="ready-title"><div className="section-heading"><div><h2 id="ready-title" className="section-title">配置就绪</h2><p className="helper-text">当前工作区中的示例配置</p></div></div><div className="ready-list"><Link to="/upstreams"><span>上游服务</span><strong>{upstreams.length}</strong></Link><Link to="/routes"><span>模型路由</span><strong>{routes.length}</strong></Link><Link to="/credentials"><span>接入凭证</span><strong>{data.credentials.length}</strong></Link></div></section>
        <section className="overview-panel" aria-labelledby="summary-title"><div className="section-heading"><div><h2 id="summary-title" className="section-title">运行概况</h2><p className="helper-text">最近示例调用的摘要</p></div></div><div className="metric-tray"><div><span className="metric-label">调用数</span><strong>{logs.length}</strong></div><div><span className="metric-label">成功 / 失败</span><strong>{succeeded} / {failed}</strong></div><div><span className="metric-label">平均耗时</span><strong>{average === null ? "-" : <>{average}<small> ms</small></>}</strong></div></div></section>
      </div>
      <section className="page-section" aria-labelledby="recent-logs-title">
        <div className="section-heading">
          <h2 id="recent-logs-title" className="section-title">最近调用</h2>
          <Link to="/logs" className="quiet-link">查看日志</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>请求 ID</th><th>模型</th><th>协议方向</th><th>状态</th><th>耗时</th></tr></thead>
            <tbody>{logs.slice(0, 3).map((log) => (
              <tr key={log.id}><td><code>{log.id}</code></td><td>{log.model}</td><td>{log.direction}</td><td><span className={`status-badge ${log.status.startsWith("成功") ? "status-positive" : "status-negative"}`}>{log.status}</span></td><td className="numeric">{log.durationMs} ms</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
