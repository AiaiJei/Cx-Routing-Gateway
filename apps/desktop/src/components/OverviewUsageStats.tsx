import type { OverviewRange, OverviewSummary } from "../domain/overview-analytics";
import { formatOverviewRate, tokenCoverage } from "../domain/overview-analytics";
import { formatMetric } from "../domain/request-log";

type Props = { summary: OverviewSummary; range: OverviewRange; retentionReached: boolean; refreshing: boolean };

export function OverviewUsageStats({ summary, range, retentionReached, refreshing }: Props) {
  return <section className="metric-strip" aria-labelledby="overview-usage-title" aria-busy={refreshing}>
    <h2 id="overview-usage-title" className="sr-only">用量统计</h2>
    <div className="metric" role="group" aria-label="调用总数"><span>调用总数</span><strong>{formatMetric(summary.calls)}</strong><small>{range === "today" ? "今天（本地时间）" : range === "24h" ? "最近 24 小时" : "已保留记录"}</small></div>
    <div className="metric" role="group" aria-label="调用结果"><span>成功 / 未成功</span><strong>{formatMetric(summary.succeeded)}<em> / {formatMetric(summary.failed)}</em></strong><small>成功率 {formatOverviewRate(summary.successRate)}</small></div>
    <div className="metric" role="group" aria-label="已上报 Token"><span>已上报 Token</span><strong>{formatMetric(summary.tokens.total.value)}</strong><small>{tokenCoverage(summary.tokens.total, summary.calls)}</small></div>
    <div className="metric" role="group" aria-label="平均耗时"><span>平均耗时</span><strong>{summary.averageDurationMs === null ? "—" : <>{formatMetric(summary.averageDurationMs)}<small> ms</small></>}</strong><small>{summary.durationReported} / {summary.calls} 条有计时</small></div>
    {retentionReached && <p className="overview-chart__retention" role="status">已达到日志保留上限，用量与模型分析可能不完整。</p>}
  </section>;
}
