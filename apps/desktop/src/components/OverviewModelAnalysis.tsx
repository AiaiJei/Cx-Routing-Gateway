import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { OverviewModelSummary } from "../domain/overview-analytics";
import { formatOverviewRate, tokenCoverage } from "../domain/overview-analytics";
import { formatDuration, formatMetric } from "../domain/request-log";
import { CustomSelect } from "./CustomSelect";
import { OverviewModelChart } from "./OverviewModelChart";
import { buildModelDistribution, formatModelShare } from "../domain/overview-model-chart";

export function OverviewModelAnalysis({ models, periodLabel = "今天（本地时间）" }: { models: OverviewModelSummary[]; periodLabel?: string }) {
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const distribution = useMemo(() => buildModelDistribution(models), [models]);
  const selected = distribution.segments.find((model) => model.model === chosenModel) ?? distribution.segments[0];
  function selectModel(name: string) {
    if (!distribution.segments.some((model) => model.model === name)) return;
    setChosenModel(name);
  }
  return <section className="overview-models" aria-labelledby="overview-models-title">
    <div className="section-heading overview-models__heading">
      <div><h2 id="overview-models-title" className="section-title">模型数据分析</h2><p className="helper-text">{periodLabel} · 全部模型调用占比 · 已保留记录</p></div>
      <Link to="/logs" className="quiet-link">查看调用日志</Link>
    </div>
    <div className="overview-model-layout">
      <div className="overview-model-aggregate">
        <OverviewModelChart distribution={distribution} selectedModel={selected?.model} onSelect={selectModel} />
        <p className="overview-data-note">每个色块代表一个模型；占比按调用次数计算，全部模型均在图中。图例可滚动查看。</p>
      </div>
      {selected ? <section className="overview-model-details" aria-label="所选模型明细">
        <span>查看模型</span>
        <CustomSelect ariaLabel="查看模型" value={selected.model} options={distribution.segments.map((model) => ({ value: model.model, label: model.model }))} onChange={selectModel} />
        <p className={`overview-model-state${selected.latestStatus === "失败" ? " overview-model-state--failed" : ""}`}>{selected.latestStatus ? `最近调用${selected.latestStatus}` : "最近状态未知"}</p>
        <dl>
          <div><dt>调用量 / 占比</dt><dd title={formatMetric(selected.calls)}>{formatMetric(selected.calls)}</dd><span>{formatModelShare(selected.share)}</span></div>
          <div><dt>成功率</dt><dd>{formatOverviewRate(selected.successRate)}</dd></div>
          <div><dt>成功 / 未成功</dt><dd title={`${selected.succeeded} / ${selected.failed}`}>{formatMetric(selected.succeeded)} / {formatMetric(selected.failed)}</dd></div>
          <div><dt>平均耗时</dt><dd title={formatDuration(selected.averageDurationMs)}>{formatDuration(selected.averageDurationMs)}</dd><span title={`${selected.durationReported} / ${selected.calls} 条有计时`}>{selected.durationReported} / {selected.calls} 条有计时</span></div>
          <div className="overview-model-details__tokens"><dt>已上报 Token</dt><dd title={formatMetric(selected.tokens.total.value)}>{formatMetric(selected.tokens.total.value)}</dd><span title={tokenCoverage(selected.tokens.total, selected.calls)}>{tokenCoverage(selected.tokens.total, selected.calls)}</span></div>
        </dl>
      </section> : <section className="overview-model-details" aria-label="所选模型明细"><p className="helper-text">有调用后可查看模型状态和用量明细。</p></section>}
    </div>
  </section>;
}
