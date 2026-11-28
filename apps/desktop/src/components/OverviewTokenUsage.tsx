import { useMemo } from "react";
import type { CallLog } from "../domain/types";
import type { OverviewSummary } from "../domain/overview-analytics";
import { tokenCoverage } from "../domain/overview-analytics";
import { buildTokenComposition } from "../domain/overview-token-composition";
import { formatMetric } from "../domain/request-log";

type Props = { logs: readonly CallLog[]; summary: OverviewSummary };
const fields = [["input", "输入 Token"], ["output", "输出 Token"], ["cacheRead", "缓存读取"], ["cacheWrite", "缓存写入"]] as const;

export function OverviewTokenUsage({ logs, summary }: Props) {
  const composition = useMemo(() => buildTokenComposition(logs), [logs]);
  const inputShare = composition.total ? composition.input! / composition.total * 100 : null;
  return <section className="token-panel" aria-labelledby="token-panel-title">
    <div className="panel-header"><h2 id="token-panel-title">Token 构成</h2></div>
    {inputShare !== null ? <div className="token-bar" role="img" aria-label={`完整上报的 ${composition.reported} / ${logs.length} 条请求：输入 ${formatMetric(composition.input)}，输出 ${formatMetric(composition.output)}`}>
      <span style={{ width: `${inputShare}%` }} /><span style={{ width: `${100 - inputShare}%` }} />
    </div> : <p className="side-help">{!composition.reported ? "未上报完整输入和输出" : composition.total === null ? "数值超出安全范围" : "已上报用量为 0"}</p>}
    {fields.map(([key, label]) => <div className={`token-row${key.startsWith("cache") ? " token-row--cache" : ""}`} role="group" aria-label={label} key={key}>
      <span>{key === "input" || key === "output" ? <i className={`${key}-token`} aria-hidden="true" /> : null}<span>{label}<small>{tokenCoverage(summary.tokens[key], summary.calls)}</small></span></span>
      <strong>{formatMetric(summary.tokens[key].value)}</strong>
    </div>)}
    <p className="side-help">构成图仅统计输入和输出均已上报的 {composition.reported} / {logs.length} 条请求。</p>
    <p className="side-help">未上报的用量保持未知；缓存不重复加入总量。</p>
  </section>;
}
