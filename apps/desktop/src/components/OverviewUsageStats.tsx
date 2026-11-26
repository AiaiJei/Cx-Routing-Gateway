import type { OverviewRange, OverviewSummary } from "../domain/overview-analytics";
import { formatOverviewRate, tokenCoverage } from "../domain/overview-analytics";
import { formatMetric } from "../domain/request-log";
import { OverviewIcon } from "./OverviewIcon";

type Props = {
  summary: OverviewSummary;
  range: OverviewRange;
  retentionReached: boolean;
  refreshing: boolean;
  onRangeChange: (range: OverviewRange) => void;
  onRefresh: () => void;
};

const tokenDetails = [["input", "输入 Token"], ["output", "输出 Token"], ["cacheRead", "缓存读取"], ["cacheWrite", "缓存写入"]] as const;

export function OverviewUsageStats({ summary, range, retentionReached, refreshing, onRangeChange, onRefresh }: Props) {
  return <section className="overview-usage" aria-labelledby="overview-usage-title">
    <div className="section-heading overview-usage__heading">
      <div>
        <h2 id="overview-usage-title" className="section-title">用量统计</h2>
        <p className="helper-text">{range === "24h" ? "最近 24 小时内的已保留调用" : "当前已保留的调用记录"} · 非历史全量</p>
      </div>
      <div className="overview-filters">
        <label htmlFor="overview-range">统计范围</label>
        <select id="overview-range" value={range} onChange={(event) => onRangeChange(event.target.value === "24h" ? "24h" : "retained")}>
          <option value="retained">已保留记录</option><option value="24h">最近 24 小时</option>
        </select>
        <button className="geist-button geist-button--secondary" type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? "刷新中…" : "刷新数据"}</button>
      </div>
    </div>
    <div className="overview-metrics" aria-busy={refreshing}>
      <div role="group" aria-label="调用总数">
        <OverviewIcon name="logs" size={40} />
        <div className="overview-metric__content"><strong className="overview-metric__value">{formatMetric(summary.calls)}</strong><span className="overview-metric__caption">调用总数</span><span className="overview-metric__caption">{range === "24h" ? "最近 24 小时" : "已保留记录"}</span></div>
      </div>
      <div role="group" aria-label="调用结果">
        <OverviewIcon name="outcomes" size={40} />
        <div className="overview-metric__content"><strong className="overview-metric__value">{formatMetric(summary.succeeded)} / {formatMetric(summary.failed)}</strong><span className="overview-metric__caption">成功 / 未成功</span><span className="overview-metric__caption">成功率 {formatOverviewRate(summary.successRate)}</span></div>
      </div>
      <div role="group" aria-label="已上报 Token">
        <OverviewIcon name="tokens" size={40} />
        <div className="overview-metric__content"><strong className="overview-metric__value">{formatMetric(summary.tokens.total.value)}</strong><span className="overview-metric__caption">已上报 Token</span><span className="overview-metric__caption">{tokenCoverage(summary.tokens.total, summary.calls)}</span></div>
      </div>
      <div role="group" aria-label="平均耗时">
        <OverviewIcon name="duration" size={40} />
        <div className="overview-metric__content"><strong className="overview-metric__value">{summary.averageDurationMs === null ? "—" : <>{formatMetric(summary.averageDurationMs)}<small> ms</small></>}</strong><span className="overview-metric__caption">平均耗时</span><span className="overview-metric__caption">{summary.durationReported} / {summary.calls} 条有计时</span></div>
      </div>
    </div>
    <dl className="overview-token-details" aria-label="Token 用量明细">
      {tokenDetails.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatMetric(summary.tokens[key].value)}<span>{tokenCoverage(summary.tokens[key], summary.calls)}</span></dd></div>)}
    </dl>
    <p className="overview-data-note">Token 按上游已上报值汇总，未上报不记为 0；缓存可能已计入输入，不重复加到总量。</p>
    {retentionReached && <p className="overview-chart__retention" role="status">已达到日志保留上限，用量与模型分析可能不完整。</p>}
  </section>;
}
