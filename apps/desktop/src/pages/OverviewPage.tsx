import { WorkspaceState } from "../components/WorkspaceState";
import { Link } from "react-router";
import { EmptyResult, FixtureNotice, PageHeader } from "../components/PageHeader";
import { ProtocolFlow } from "../components/ProtocolBadge";
import { OverviewUsageChart } from "../components/OverviewUsageChart";
import { OverviewIcon } from "../components/OverviewIcon";
import { useWorkspace } from "../data/use-workspace";
import "../styles/overview.css";

export function OverviewPage() {
  const { data, error, loading } = useWorkspace();
  const { gateway, upstreams, routes, logs, credentials } = data;
  const succeeded = logs.filter((log) => log.status.startsWith("成功")).length;
  const unsuccessful = logs.length - succeeded;
  const failedLogs = logs.filter((log) => log.status.startsWith("失败"));
  const timedLogs = logs.filter((log) => log.durationMs !== null && Number.isFinite(log.durationMs));
  const average = timedLogs.length ? Math.round(timedLogs.reduce((total, log) => total + (log.durationMs ?? 0), 0) / timedLogs.length) : null;
  const metrics = gateway.metrics;
  const totalRequests = metrics?.total ?? logs.length;
  const successfulRequests = metrics?.completed ?? succeeded;
  const unsuccessfulRequests = metrics ? metrics.failed + metrics.rejected : unsuccessful;
  const averageDuration = metrics?.avgDurationMs ?? average;
  const checkedUpstreams = upstreams.filter((upstream) => upstream.status === "已连接").length;
  const pendingUpstreams = upstreams.filter((upstream) => upstream.status === "待测试").length;
  const disconnectedUpstreams = upstreams.filter((upstream) => upstream.status === "未连接").length;
  const enabledRoutes = routes.filter((route) => route.enabled).length;
  const activeCredentials = credentials.filter((credential) => credential.status === "运行时").length;
  const revokedCredentials = credentials.filter((credential) => credential.status === "已撤销").length;
  const credentialCount = data.meta.live ? activeCredentials : credentials.length;
  const credentialCaption = data.meta.live ? "有效凭证" : "示例凭证";
  const credentialState = data.meta.live ? `${revokedCredentials} 已撤销` : "浏览器预览";
  const gatewayStatus = data.meta.live ? gateway.state : "运行时未接入";
  const gatewayStateTone = !data.meta.live || gateway.state === "未接入" ? "warning" : gateway.state === "运行中" ? "running" : "failed";
  const gatewayDescription = data.meta.live
    ? gateway.state === "运行中" ? "本机 Gateway 已通过 Desktop 生命周期启动。" : "请检查 Gateway 运行状态。"
    : "浏览器展示示例；在 Desktop 中可查看本机 Gateway 状态。";

  if (loading || error) return <WorkspaceState title="总览" loading={loading} error={error} />;

  return (
    <div className="page-content overview-page">
      <PageHeader
        title="总览"
        description="先确认 Gateway 状态，再处理配置和最近调用。"
        action={(
          <div className="overview-actions" aria-label="快捷操作">
            <Link to="/upstreams" className="geist-button geist-button--secondary">查看上游</Link>
            <Link to="/routes" className="geist-button geist-button--secondary">查看路由</Link>
            <Link to="/credentials" className="geist-button geist-button--secondary">查看凭证</Link>
          </div>
        )}
      />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时数据" : "示例数据 · 非实时"}</FixtureNotice>

      <section className="overview-status-grid" aria-label="Gateway 与配置状态">
        <section className="overview-status overview-status--gateway" aria-labelledby="gateway-status-title">
          <OverviewIcon name="gateway" />
          <h2 id="gateway-status-title" className="section-title">本机 Gateway</h2>
          <p className="overview-status__value overview-status__state">
            <span className={`overview-state-dot overview-state-dot--${gatewayStateTone}`} aria-hidden="true" />
            {gatewayStatus}
          </p>
          <p className="helper-text">{gatewayDescription}</p>
          <div className="endpoint-inline"><span className="field-label">本机接入地址</span><code>{gateway.url}</code></div>
        </section>

        <section className="overview-status" aria-labelledby="upstream-status-title">
          <OverviewIcon name="upstreams" />
          <h2 id="upstream-status-title" className="section-title">上游最近检查</h2>
          <div className="overview-resource-count"><strong className="overview-status__count">{upstreams.length}</strong><span>个上游</span></div>
          <p className="overview-check-summary">{`最近测试通过 ${checkedUpstreams} · 待测试 ${pendingUpstreams} · 未连接 ${disconnectedUpstreams}`}</p>
          <p className="helper-text">仅反映最近一次检查，不代表持续在线。</p>
        </section>

        <section className="overview-status overview-status--configuration" aria-labelledby="configuration-status-title">
          <h2 id="configuration-status-title" className="section-title">路由与凭证</h2>
          <div className="overview-status__config-summary">
            <div className="overview-config-metric" role="group" aria-label="模型路由">
              <OverviewIcon name="routes" size={40} />
              <div className="overview-config-metric__content">
                <strong className="overview-status__count">{`${enabledRoutes} / ${routes.length}`}</strong>
                <span className="metric-label">模型路由</span>
                <span className="overview-status__caption">已启用</span>
              </div>
              <Link to="/routes" className="quiet-link">管理</Link>
            </div>
            <div className="overview-config-metric" role="group" aria-label="接入凭证">
              <OverviewIcon name="credentials" size={40} />
              <div className="overview-config-metric__content">
                <strong className="overview-status__count">{credentialCount}</strong>
                <span className="metric-label">{credentialCaption}</span>
                <span className="overview-status__caption">{credentialState}</span>
              </div>
              <Link to="/credentials" className="quiet-link">管理</Link>
            </div>
          </div>
        </section>
      </section>

      <section className="overview-metrics" aria-labelledby="overview-metrics-title">
        <h2 id="overview-metrics-title" className="sr-only">运行概况</h2>
        <div role="group" aria-label="已保留请求">
          <OverviewIcon name="logs" size={40} />
          <div className="overview-metric__content"><strong className="overview-metric__value">{totalRequests}</strong><span className="overview-metric__caption">已保留请求</span></div>
        </div>
        <div role="group" aria-label="成功 / 未成功">
          <OverviewIcon name="outcomes" size={40} />
          <div className="overview-metric__content"><strong className="overview-metric__value">{`${successfulRequests} / ${unsuccessfulRequests}`}</strong><span className="overview-metric__caption">成功 / 未成功</span></div>
        </div>
        <div role="group" aria-label="平均耗时">
          <OverviewIcon name="duration" size={40} />
          <div className="overview-metric__content"><strong className="overview-metric__value">{averageDuration === null ? "—" : <>{averageDuration}<small> ms</small></>}</strong><span className="overview-metric__caption">平均耗时</span></div>
        </div>
      </section>

      <div className="overview-activity-grid">
        <OverviewUsageChart logs={logs} nowMs={Date.now()} retentionLimit={data.usageRetentionCount} />
        {failedLogs.length > 0 && (
          <section className="attention-panel" aria-labelledby="attention-title">
            <div className="section-heading">
              <div>
                <h2 id="attention-title" className="section-title">需要关注</h2>
                <p className="helper-text">{data.meta.live ? "最近失败调用" : "示例调用中的失败记录"}</p>
              </div>
              <Link to="/logs" className="quiet-link">查看日志</Link>
            </div>
            <div className="attention-list">
              {failedLogs.map((log) => (
                <div className="attention-row" key={log.id}>
                  <span className="attention-mark" aria-hidden="true">!</span>
                  <div><strong>{log.model}</strong><span className="cell-subtext">{log.error ?? log.status}</span></div>
                  <code>{log.id}</code>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="page-section" aria-labelledby="recent-logs-title">
        <div className="section-heading">
          <h2 id="recent-logs-title" className="section-title">最近调用</h2>
          <Link to="/logs" className="quiet-link">查看日志</Link>
        </div>
        {logs.length ? (
          <div className="table-scroll" role="region" aria-label="最近调用列表" tabIndex={0}>
            <table>
              <thead><tr><th>请求 ID</th><th>模型</th><th>协议方向</th><th>状态</th><th className="numeric">耗时</th></tr></thead>
              <tbody>{logs.slice(0, 3).map((log) => (
                <tr key={log.id}>
                  <td><code>{log.id}</code></td>
                  <td>{log.model}</td>
                  <td><ProtocolFlow value={log.direction} /></td>
                  <td><span className={`status-badge ${log.status.startsWith("成功") ? "status-positive" : "status-negative"}`}>{log.status}</span></td>
                  <td className="numeric">{log.durationMs === null ? "—" : `${log.durationMs} ms`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyResult>尚无调用记录</EmptyResult>}
      </section>
    </div>
  );
}
