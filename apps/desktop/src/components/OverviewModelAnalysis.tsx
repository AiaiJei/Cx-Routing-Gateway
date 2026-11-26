import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { OverviewModelSummary } from "../domain/overview-analytics";
import { formatOverviewRate, tokenCoverage } from "../domain/overview-analytics";
import { formatDuration, formatMetric } from "../domain/request-log";
import { EmptyResult } from "./PageHeader";
import { OverviewModelChart } from "./OverviewModelChart";
import { modelChartMaximum, modelChartMetrics, modelChartValue } from "../domain/overview-model-chart";
import type { ModelChartMetric } from "../domain/overview-model-chart";

const groupSize = 5;

export function OverviewModelAnalysis({ models }: { models: OverviewModelSummary[] }) {
  const [metric, setMetric] = useState<ModelChartMetric>("calls");
  const [group, setGroup] = useState(0);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const ranked = useMemo(() => [...models].sort((first, second) => (modelChartValue(second, metric) ?? -Infinity) - (modelChartValue(first, metric) ?? -Infinity) || first.model.localeCompare(second.model)), [models, metric]);
  const lastGroup = Math.max(0, Math.ceil(ranked.length / groupSize) - 1);
  const currentGroup = Math.min(group, lastGroup);
  const offset = currentGroup * groupSize;
  const visibleModels = ranked.slice(offset, offset + groupSize);
  const selected = visibleModels.find((model) => model.model === chosenModel) ?? visibleModels[0];
  const maximum = modelChartMaximum(ranked, metric);
  function selectModel(name: string) {
    const index = ranked.findIndex((model) => model.model === name);
    if (index < 0) return;
    setGroup(Math.floor(index / groupSize));
    setChosenModel(name);
  }
  return <section className="overview-models" aria-labelledby="overview-models-title">
    <div className="section-heading overview-models__heading">
      <div><h2 id="overview-models-title" className="section-title">模型数据分析</h2><p className="helper-text">按请求模型标识比较 · 每组最多 5 个 · 当前指标从高到低</p></div>
      <div className="overview-model-controls">
        <label htmlFor="overview-model-metric">比较指标</label>
        <select id="overview-model-metric" value={metric} disabled={!models.length} onChange={(event) => { const next = modelChartMetrics.find((item) => item.key === event.target.value); if (next) { setMetric(next.key); setGroup(0); setChosenModel(null); } }}>{modelChartMetrics.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select>
        <Link to="/logs" className="quiet-link">查看调用日志</Link>
      </div>
    </div>
    {selected ? <div className="overview-model-layout">
      <div className="overview-model-comparison">
        <OverviewModelChart models={visibleModels} metric={metric} maximum={maximum} selectedModel={selected.model} onSelect={selectModel} />
        <div className="overview-model-pager">
          <span aria-live="polite">{offset + 1}–{Math.min(offset + groupSize, ranked.length)} / {ranked.length} 个模型</span>
          <div><button className="geist-button geist-button--secondary geist-button--small" type="button" aria-label="上一组模型" disabled={currentGroup === 0} onClick={() => { setGroup(currentGroup - 1); setChosenModel(null); }}>上一组</button><button className="geist-button geist-button--secondary geist-button--small" type="button" aria-label="下一组模型" disabled={currentGroup === lastGroup} onClick={() => { setGroup(currentGroup + 1); setChosenModel(null); }}>下一组</button></div>
        </div>
        <p className="overview-data-note">各组使用同一刻度；短名称可悬停查看，精确数值见所选模型明细。</p>
      </div>
      <section className="overview-model-details" aria-label="所选模型明细">
        <label htmlFor="overview-model-select">查看模型</label>
        <select id="overview-model-select" value={selected.model} title={selected.model} onChange={(event) => selectModel(event.target.value)}>{ranked.map((model) => <option key={model.model} value={model.model}>{model.model}</option>)}</select>
        <p className={`overview-model-state${selected.latestStatus === "失败" ? " overview-model-state--failed" : ""}`}>{selected.latestStatus ? `最近调用${selected.latestStatus}` : "最近状态未知"}</p>
        <dl>
          <div><dt>调用量</dt><dd title={formatMetric(selected.calls)}>{formatMetric(selected.calls)}</dd></div>
          <div><dt>成功率</dt><dd>{formatOverviewRate(selected.successRate)}</dd></div>
          <div><dt>成功 / 未成功</dt><dd title={`${selected.succeeded} / ${selected.failed}`}>{formatMetric(selected.succeeded)} / {formatMetric(selected.failed)}</dd></div>
          <div><dt>平均耗时</dt><dd title={formatDuration(selected.averageDurationMs)}>{formatDuration(selected.averageDurationMs)}</dd><span title={`${selected.durationReported} / ${selected.calls} 条有计时`}>{selected.durationReported} / {selected.calls} 条有计时</span></div>
          <div className="overview-model-details__tokens"><dt>已上报 Token</dt><dd title={formatMetric(selected.tokens.total.value)}>{formatMetric(selected.tokens.total.value)}</dd><span title={tokenCoverage(selected.tokens.total, selected.calls)}>{tokenCoverage(selected.tokens.total, selected.calls)}</span></div>
        </dl>
      </section>
    </div> : <EmptyResult>当前范围内没有模型调用记录</EmptyResult>}
  </section>;
}
