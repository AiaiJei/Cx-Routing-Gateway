import { Link } from "react-router";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { workspaceFixtures } from "../data/fixtures";

export function OverviewPage() {
  const { gateway, upstreams, routes, logs } = workspaceFixtures;
  const succeeded = logs.filter((log) => log.status.startsWith("成功")).length;
  const failed = logs.length - succeeded;
  const average = Math.round(logs.reduce((total, log) => total + log.durationMs, 0) / logs.length);

  return (
    <div className="page-content">
      <PageHeader title="总览" description="查看本机 Gateway 配置概况与最近的示例调用。" />
      <FixtureNotice />
      <section className="overview-status" aria-labelledby="gateway-status-title">
        <div>
          <h2 id="gateway-status-title" className="section-title">本机 Gateway</h2>
          <p className="status-line"><span className="state-dot" />运行时未接入</p>
          <p className="helper-text">打开 Desktop 后的自动启动流程尚未实现。</p>
        </div>
        <div className="endpoint-block">
          <span className="field-label">预设本机接入地址</span>
          <code>{gateway.url}</code>
          <span className="helper-text">界面示例，当前没有服务监听此地址。</span>
        </div>
      </section>
      <section className="page-section" aria-labelledby="summary-title">
        <div className="section-heading"><h2 id="summary-title" className="section-title">配置概况</h2></div>
        <div className="metric-tray">
          <div><span className="metric-label">上游服务</span><strong>{upstreams.length}</strong></div>
          <div><span className="metric-label">模型路由</span><strong>{routes.length}</strong></div>
          <div><span className="metric-label">示例调用</span><strong>{logs.length}</strong></div>
          <div><span className="metric-label">模拟成功 / 失败</span><strong>{succeeded} / {failed}</strong></div>
          <div><span className="metric-label">平均耗时</span><strong>{average}<small> ms</small></strong></div>
        </div>
      </section>
      <section className="page-section" aria-labelledby="recent-logs-title">
        <div className="section-heading">
          <h2 id="recent-logs-title" className="section-title">最近调用</h2>
          <Link to="/logs" className="quiet-link">查看日志</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>请求 ID</th><th>模型</th><th>协议方向</th><th>状态</th><th>耗时</th></tr></thead>
            <tbody>{logs.slice(0, 3).map((log) => (
              <tr key={log.id}><td><code>{log.id}</code></td><td>{log.model}</td><td>{log.direction}</td><td>{log.status}</td><td className="numeric">{log.durationMs} ms</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
