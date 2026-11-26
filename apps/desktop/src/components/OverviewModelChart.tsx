import type { OverviewModelSummary } from "../domain/overview-analytics";
import { compactChartValue, formatModelMetric, modelChartMetrics, modelChartValue } from "../domain/overview-model-chart";
import type { ModelChartMetric } from "../domain/overview-model-chart";

type Props = { models: OverviewModelSummary[]; metric: ModelChartMetric; maximum: number; selectedModel: string; onSelect: (model: string) => void };
const plotHeight = 220;
const tickFractions = [0, 0.25, 0.5, 0.75, 1];

export function OverviewModelChart({ models, metric, maximum, selectedModel, onSelect }: Props) {
  const definition = modelChartMetrics.find((item) => item.key === metric)!;
  const hasValues = models.some((model) => modelChartValue(model, metric) !== null);
  const rows = { gridTemplateRows: `repeat(${models.length}, minmax(0, 1fr))` };
  return <div className="overview-comparison-chart">
    <div className="overview-comparison-axis" aria-hidden="true">
      <span>模型</span><div>{hasValues && tickFractions.map((fraction) => <span key={fraction} style={{ left: `${fraction * 100}%` }}>{metric === "successRate" ? `${maximum * fraction}%` : compactChartValue(maximum * fraction, metric)}</span>)}</div><span>{definition.unit}</span>
    </div>
    <div className="overview-comparison-body">
      <div className="overview-comparison-labels" style={rows}>{models.map((model) => <button key={model.model} type="button" title={model.model} aria-label={`查看 ${model.model}`} aria-pressed={selectedModel === model.model} onClick={() => onSelect(model.model)}><span>{model.model}</span></button>)}</div>
      <div className="overview-comparison-plot">
        <svg viewBox={`0 0 100 ${plotHeight}`} preserveAspectRatio="none" role="img" aria-label={definition.chartName} data-maximum={maximum}>
          <title>{definition.chartName}</title>
          <desc>{`零起点，统一刻度 0 至 ${maximum} ${definition.unit}。${models.map((model) => `${model.model}：${formatModelMetric(modelChartValue(model, metric), metric)}`).join("；")}`}</desc>
          {hasValues && tickFractions.map((fraction) => <line key={fraction} x1={fraction * 100} x2={fraction * 100} y1="0" y2={plotHeight} className="overview-comparison-grid" />)}
          {models.map((model, index) => {
            const value = modelChartValue(model, metric);
            if (value === null) return null;
            return <rect key={model.model} data-model={model.model} data-selected={selectedModel === model.model} x="0" y={(index + 0.5) * plotHeight / models.length - 9} width={value / maximum * 100} height="18"><title>{`${model.model}：${formatModelMetric(value, metric)}`}</title></rect>;
          })}
        </svg>
        {!hasValues && <p className="overview-comparison-empty">本组模型未上报该指标</p>}
      </div>
      <div className="overview-comparison-values" style={rows}>{models.map((model) => <span key={model.model} title={formatModelMetric(modelChartValue(model, metric), metric)}>{compactChartValue(modelChartValue(model, metric), metric)}</span>)}</div>
    </div>
  </div>;
}
