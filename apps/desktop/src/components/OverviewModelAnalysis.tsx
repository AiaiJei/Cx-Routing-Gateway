import { useState } from "react";
import { Link } from "react-router";
import type { OverviewModelSummary } from "../domain/overview-analytics";
import { formatOverviewRate, tokenCoverage } from "../domain/overview-analytics";
import { formatDuration, formatMetric } from "../domain/request-log";
import { EmptyResult } from "./PageHeader";

export function OverviewModelAnalysis({ models }: { models: OverviewModelSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleModels = expanded ? models : models.slice(0, 5);
  const maximum = Math.max(1, ...models.map((model) => model.calls));
  return <section className="overview-models" aria-labelledby="overview-models-title">
    <div className="section-heading">
      <div><h2 id="overview-models-title" className="section-title">模型数据分析</h2><p className="helper-text">按请求模型标识分组 · {models.length} 个模型 · 调用量从高到低</p></div>
      <Link to="/logs" className="quiet-link">查看调用日志</Link>
    </div>
    {models.length ? <>
      <p className="overview-models__scroll-hint">左右滑动查看完整统计，模型名称保持可见。</p>
      <div className="table-scroll" role="region" aria-label="模型调用数据，可横向滚动" tabIndex={0}>
        <table className="data-table overview-model-table" aria-label="模型调用分析">
          <colgroup><col className="overview-model-col" /><col /><col /><col /><col /><col /></colgroup>
          <thead><tr><th scope="col">模型 / 最近调用</th><th scope="col" className="numeric">调用量<span className="cell-subtext">同尺比较 0–{formatMetric(maximum)}</span></th><th scope="col" className="numeric">成功 / 未成功</th><th scope="col" className="numeric">成功率</th><th scope="col" className="numeric">已上报 Token</th><th scope="col" className="numeric">平均耗时</th></tr></thead>
          <tbody>{visibleModels.map((model) => <tr key={model.model}>
            <th scope="row"><span className="overview-model-name">{model.model}</span><span className={`overview-model-state${model.latestStatus === "失败" ? " overview-model-state--failed" : ""}`}>{model.latestStatus ? `最近调用${model.latestStatus}` : "最近状态未知"}</span></th>
            <td className="numeric"><strong>{formatMetric(model.calls)}</strong><svg className="overview-model-bar" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`${model.model}：${model.calls} 次调用，刻度 0 至 ${maximum}`}><title>{model.model} 调用量</title><rect className="overview-model-bar__track" width="100" height="4" /><rect width={model.calls / maximum * 100} height="4" /></svg></td>
            <td className="numeric">{formatMetric(model.succeeded)} / {formatMetric(model.failed)}</td>
            <td className="numeric">{formatOverviewRate(model.successRate)}</td>
            <td className="numeric">{formatMetric(model.tokens.total.value)}<span className="cell-subtext">{tokenCoverage(model.tokens.total, model.calls)}</span></td>
            <td className="numeric">{formatDuration(model.averageDurationMs)}<span className="cell-subtext">{model.durationReported} / {model.calls} 条有计时</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      {models.length > 5 && <button className="geist-button geist-button--secondary overview-models__expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起模型列表" : `展开全部 ${models.length} 个模型`}</button>}
    </> : <EmptyResult>当前范围内没有模型调用记录</EmptyResult>}
  </section>;
}
