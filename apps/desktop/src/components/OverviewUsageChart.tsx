import type { CallLog } from "../domain/types";
import { buildOverviewUsageTrend } from "../domain/overview-usage";
import { EmptyResult } from "./PageHeader";
import "../styles/overview.css";

type OverviewUsageChartProps = { logs: Pick<CallLog, "time">[]; nowMs: number; retentionLimit?: number };

const xTickIndices = [0, 6, 12, 18, 23];
const plot = { x: 48, y: 12, width: 654, height: 158 };

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export function OverviewUsageChart({ logs, nowMs, retentionLimit }: OverviewUsageChartProps) {
  const trend = buildOverviewUsageTrend(logs, nowMs, retentionLimit);
  const hasData = trend.observedCount > 0;

  if (!hasData) {
    return (
      <section className="overview-chart" aria-labelledby="overview-usage-chart-title">
        <div className="section-heading">
          <h2 id="overview-usage-chart-title" className="section-title">最近 24 小时请求趋势</h2>
        </div>
        <EmptyResult>{logs.length ? "最近 24 小时没有可绘制的请求记录" : "最近 24 小时没有已记录请求"}</EmptyResult>
        {trend.retentionReached && <p className="overview-chart__retention" role="status">已达到日志保留上限，图表覆盖范围可能不完整。</p>}
      </section>
    );
  }

  const maximum = Math.max(2, ...trend.buckets.map((bucket) => bucket.count));
  const yTicks = [0, Math.ceil(maximum / 2), maximum];
  const points = trend.buckets.map((bucket, index) => {
    const x = (index / (trend.buckets.length - 1)) * plot.width;
    const y = plot.y + plot.height - (bucket.count / maximum) * plot.height;
    return `${x},${y - plot.y}`;
  }).join(" ");
  const accessibleName = `最近 24 小时请求趋势图，共 ${trend.observedCount} 条已记录请求`;

  return (
    <section className="overview-chart" aria-labelledby="overview-usage-chart-title">
      <div className="section-heading">
        <div>
          <h2 id="overview-usage-chart-title" className="section-title">最近 24 小时请求趋势</h2>
          <p className="helper-text">按本机已保留请求记录统计 · {trend.observedCount} 条</p>
        </div>
      </div>
      <div className="overview-chart__plot">
        <div className="overview-chart__y-axis" aria-hidden="true">
          {[...yTicks].reverse().map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <svg className="overview-chart__svg" viewBox={`0 0 ${plot.width} ${plot.height}`} preserveAspectRatio="none" role="img" aria-label={accessibleName}>
        <title>{accessibleName}</title>
        <desc>横轴为本地时间，纵轴为每小时请求记录数。</desc>
        {yTicks.map((tick) => {
          const y = plot.height - (tick / maximum) * plot.height;
          return (
            <g className="overview-chart__grid" key={tick}>
              <line x1="0" x2={plot.width} y1={y} y2={y} />
            </g>
          );
        })}
        <polyline className="overview-chart__series" points={points} />
        </svg>
      </div>
      <div className="overview-chart__x-axis" aria-hidden="true">
        {xTickIndices.map((index, tickIndex) => {
          const bucket = trend.buckets[index];
          const edge = tickIndex === 0 ? "overview-chart__time overview-chart__time--start" : tickIndex === xTickIndices.length - 1 ? "overview-chart__time overview-chart__time--end" : "overview-chart__time";
          return <span className={edge} key={bucket.startsAt} style={{ left: `${(index / (trend.buckets.length - 1)) * 100}%` }}>{formatClock(bucket.startsAt)}</span>;
        })}
      </div>
      {trend.retentionReached && <p className="overview-chart__retention" role="status">已达到日志保留上限，图表仅反映当前保留记录，完整请求量可能更高。</p>}
    </section>
  );
}
