import { useEffect, useRef } from "react";
import { compactChartValue, formatModelShare } from "../domain/overview-model-chart";
import type { ModelDistribution } from "../domain/overview-model-chart";
import { formatMetric } from "../domain/request-log";

type Props = { distribution: ModelDistribution; selectedModel?: string; onSelect: (model: string) => void };
const circumference = 2 * Math.PI * 86;

export function OverviewModelChart({ distribution, selectedModel, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const button = list && [...list.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.dataset.model === selectedModel);
    if (!list || !button) return;
    if (button.offsetTop < list.scrollTop + 24) list.scrollTop = Math.max(0, button.offsetTop - 24);
    else if (button.offsetTop + button.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = button.offsetTop + button.offsetHeight - list.clientHeight;
  }, [distribution, selectedModel]);
  return <div className="overview-model-composition">
    <div className="overview-model-ring">
      <svg viewBox="0 0 240 240" role="img" aria-label="模型调用分布图" data-total={distribution.total}>
        <title>模型调用分布图</title>
        <desc>{`共 ${distribution.total} 次调用，${distribution.segments.length} 个模型。${distribution.segments.map((model) => `${model.model}：${model.calls} 次，占比 ${formatModelShare(model.share)}`).join("；")}`}</desc>
        <circle className="overview-model-ring__empty" cx="120" cy="120" r="86" fill="none" strokeWidth="32" />
        {distribution.segments.map((model) => <circle key={model.model} data-model={model.model} data-share={model.share} cx="120" cy="120" r="86" fill="none" stroke={model.color} strokeWidth="32" strokeDasharray={`${model.share * circumference} ${(1 - model.share) * circumference}`} strokeDashoffset={-model.start * circumference} transform="rotate(-90 120 120)"><title>{`${model.model}：${formatMetric(model.calls)} 次，${formatModelShare(model.share)}`}</title></circle>)}
      </svg>
      <div className="overview-model-ring__total" aria-hidden="true"><strong title={formatMetric(distribution.total)}>{compactChartValue(distribution.total)}</strong><span>次调用</span><span>{distribution.segments.length} 个模型</span></div>
    </div>
    <div ref={listRef} className="overview-model-legend" role="region" aria-label="全部模型图例" tabIndex={0}>
      <div className="overview-model-legend__header" aria-hidden="true"><span>模型</span><span>调用</span><span>占比</span></div>
      {distribution.segments.length ? <ul className="overview-model-legend__list">{distribution.segments.map((model) => <li key={model.model}><button type="button" data-model={model.model} aria-label={`查看 ${model.model}`} aria-pressed={selectedModel === model.model} title={`${model.model}：${formatMetric(model.calls)} 次，${formatModelShare(model.share)}`} onClick={() => onSelect(model.model)}><span className="overview-model-swatch" style={{ backgroundColor: model.color }} aria-hidden="true" /><span className="overview-model-legend__name">{model.model}</span><span>{formatMetric(model.calls)}</span><span>{formatModelShare(model.share)}</span></button></li>)}</ul> : <p className="overview-model-legend__empty">当前范围内没有模型调用记录</p>}
    </div>
  </div>;
}
