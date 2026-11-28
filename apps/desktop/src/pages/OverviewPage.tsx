import { useMemo, useState, type CSSProperties } from "react";
import { WorkspaceState } from "../components/WorkspaceState";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { OverviewControls } from "../components/OverviewControls";
import { OverviewFailures } from "../components/OverviewFailures";
import { OverviewModelAnalysis } from "../components/OverviewModelAnalysis";
import { OverviewRecentCalls } from "../components/OverviewRecentCalls";
import { OverviewRuntimePanel } from "../components/OverviewRuntimePanel";
import { OverviewTokenUsage } from "../components/OverviewTokenUsage";
import { OverviewUsageChart } from "../components/OverviewUsageChart";
import { OverviewUsageStats } from "../components/OverviewUsageStats";
import { buildOverviewAnalytics } from "../domain/overview-analytics";
import { buildOverviewUsageTrend } from "../domain/overview-usage";
import type { OverviewRange } from "../domain/overview-analytics";
import { useWorkspace } from "../data/use-workspace";
import "../styles/overview.css";
import "../styles/overview-desktop2.css";

export function OverviewPage() {
  const { data, error, loading, refresh, refreshing, refreshError } = useWorkspace();
  const [range, setRange] = useState<OverviewRange>("today");
  const nowMs = useMemo(() => Date.now(), [data, range]);
  const analytics = useMemo(() => buildOverviewAnalytics(data.logs, range, nowMs, data.usageRetentionCount), [data, range, nowMs]);
  const trend = useMemo(() => buildOverviewUsageTrend(data.logs, nowMs, data.usageRetentionCount), [data.logs, nowMs, data.usageRetentionCount]);
  const maximum = Math.max(2, ...trend.buckets.map(bucket => bucket.count));
  const chartStyle = { "--chart-midpoint": `${(1 - Math.ceil(maximum / 2) / maximum) * 100}%` } as CSSProperties;
  const periodLabel = range === "today" ? `今天 · ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(nowMs)}（本地时间）` : range === "24h" ? "最近 24 小时" : "当前已保留记录";

  if (loading || error) return <WorkspaceState title="总览" loading={loading} error={error} />;

  return <div className="overview-page overview-desktop2">
    <div className="concept-heading"><PageHeader title="总览" description="调用用量、模型表现与本机运行状态。" action={<OverviewControls range={range} refreshing={refreshing} onRangeChange={setRange} onRefresh={refresh} />} /></div>
    <div className="preview-notice"><FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时数据" : "示例数据 · 非实时"}</FixtureNotice><span className="preview-note-detail">统计截至本次读取，刷新后更新；非历史全量。</span></div>
    {refreshError && <p className="overview-refresh-error" role="alert">刷新失败：{refreshError}。当前仍显示上次数据。</p>}
    <div className="analysis-workspace">
      <div className="analysis-column">
        <OverviewUsageStats summary={analytics.summary} range={range} retentionReached={analytics.retentionReached} refreshing={refreshing} />
        <section className="trend-panel" aria-label="请求趋势分析区" style={chartStyle}>
          <OverviewUsageChart logs={data.logs} nowMs={nowMs} retentionLimit={data.usageRetentionCount} />
        </section>
        <div className="model-panel"><OverviewModelAnalysis key={range} models={analytics.models} periodLabel={periodLabel} /></div>
        <OverviewRecentCalls logs={analytics.logs} />
      </div>
      <aside className="system-column" aria-label="Gateway 状态与异常">
        <OverviewRuntimePanel data={data} />
        <OverviewFailures logs={analytics.logs} live={data.meta.live} />
        <OverviewTokenUsage logs={analytics.logs} summary={analytics.summary} />
      </aside>
    </div>
  </div>;
}
