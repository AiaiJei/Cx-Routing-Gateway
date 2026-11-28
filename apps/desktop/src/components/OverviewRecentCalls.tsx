import { Link } from "react-router";
import type { CallLog } from "../domain/types";
import { formatDuration, formatRequestTime } from "../domain/request-log";
import { EmptyResult } from "./PageHeader";
import { ProtocolFlow } from "./ProtocolBadge";

export function OverviewRecentCalls({ logs }: { logs: readonly CallLog[] }) {
  return <section className="recent-panel" aria-labelledby="recent-logs-title">
    <div className="panel-header"><div><h2 id="recent-logs-title">最近调用</h2><p>{logs.length} 条保留记录</p></div><Link to="/logs">查看日志</Link></div>
    {logs.length ? <div className="recent-scroll" role="region" aria-label="最近调用列表" tabIndex={0}><table>
      <thead><tr><th>时间 / 请求</th><th>模型</th><th>协议方向</th><th>结果</th><th className="numeric">耗时</th></tr></thead>
      <tbody>{logs.slice(0, 3).map(log => {
        const time = formatRequestTime(log.time);
        return <tr key={log.id}>
          <td><span title={time}>{time === "—" ? time : time.split(" ")[1]}</span><code title={log.id}>{log.id}</code></td>
          <td>{log.model}</td><td><ProtocolFlow value={log.direction} /></td>
          <td><span className={`result-mark${log.status.startsWith("失败") ? " is-failed" : ""}`} aria-hidden="true" />{log.status.replace("（模拟）", "")}{log.status.endsWith("（模拟）") && <span className="sample-suffix">示例</span>}</td>
          <td className="numeric">{formatDuration(log.durationMs)}</td>
        </tr>;
      })}</tbody>
    </table></div> : <EmptyResult>尚无调用记录</EmptyResult>}
  </section>;
}
