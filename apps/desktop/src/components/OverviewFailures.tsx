import { Link } from "react-router";
import type { CallLog } from "../domain/types";
import { formatDuration } from "../domain/request-log";

export function OverviewFailures({ logs, live }: { logs: readonly CallLog[]; live: boolean }) {
  const failures = logs.filter(log => log.status.startsWith("失败"));
  if (!failures.length) return null;
  return <section className="attention-panel failure-panel" aria-labelledby="attention-title">
    <div className="panel-header"><h2 id="attention-title">需要关注</h2><span className="failure-count" aria-label={`${failures.length} 次失败`}>{failures.length}</span></div>
    <p className="sr-only">{live ? "最近失败调用" : "示例调用中的失败记录"}</p>
    <div className="attention-list">
      {failures.slice(0, 3).map(log => <div className="attention-row" key={log.id}>
        <div className="attention-copy"><div className="failed-object"><span className="failure-indicator" aria-hidden="true" /><strong>{log.model}</strong></div><span className="cell-subtext failure-description">{log.error ?? log.status}</span></div>
        <code title={log.id}>{log.id}</code>
        <dl className="failure-context"><dt>上游响应</dt><dd>{log.upstreamStatus ?? "—"}</dd><dt>耗时</dt><dd>{formatDuration(log.durationMs)}</dd></dl>
      </div>)}
    </div>
    <Link to="/logs" className="failure-link">查看日志</Link>
  </section>;
}
