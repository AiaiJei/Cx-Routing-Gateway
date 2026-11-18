import { useMemo, useState } from "react";
import { EmptyResult, FixtureNotice, PageHeader, SearchField } from "../components/PageHeader";
import { useWorkspace } from "../data/use-workspace";
import type { CallLog } from "../domain/types";

export function LogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const { data, error } = useWorkspace();
  const logs = useMemo(() => data.logs.filter((log) => {
    const textMatches = `${log.id} ${log.model} ${log.credential} ${log.upstream} ${log.direction} ${log.error ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return textMatches && (status === "全部" || log.status.startsWith(status));
  }), [data.logs, query, status]);
  const hasFilter = query.length > 0 || status !== "全部";

  return (
    <div className="page-content">
      <PageHeader title="调用日志" description="查看示例请求摘要；默认不包含请求或响应正文。" />
      <FixtureNotice>示例日志 · 非运行时记录</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <div className="toolbar"><SearchField label="搜索调用日志" value={query} onChange={setQuery} />
        <label className="select-field"><span className="sr-only">按状态筛选</span><select aria-label="按状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>成功</option><option>失败</option></select></label>
        <span className="result-count">{logs.length} 条示例</span>
        {hasFilter && <button className="button-text" type="button" aria-label="清除筛选" onClick={() => { setQuery(""); setStatus("全部"); }}>清除筛选</button>}
      </div>
      {logs.length ? <div className="table-scroll"><table>
        <thead><tr><th>时间 / 请求 ID</th><th>模型</th><th>入口凭证</th><th>协议方向</th><th>结果</th><th>耗时</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id}>
          <td><time>{log.time}</time><code className="cell-subtext">{log.id}</code></td><td>{log.model}</td><td>{log.credential}</td><td>{log.direction}</td><td>{log.status}{log.error && <span className="cell-subtext">{log.error}</span>}</td><td className="numeric">{log.durationMs} ms</td>
          <td><button className="button-text" type="button" aria-label={`查看 ${log.id}`} onClick={() => setSelectedLog(log)}>详情</button></td>
        </tr>)}</tbody>
      </table></div> : <EmptyResult>没有匹配的调用记录</EmptyResult>}
      {selectedLog && <div className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="log-detail-title">
        <div className="detail-dialog-header"><h2 id="log-detail-title" className="section-title">请求 {selectedLog.id} 详情</h2><button className="button-text" type="button" aria-label="关闭详情" onClick={() => setSelectedLog(null)}>关闭</button></div>
        <dl className="detail-grid"><div><dt>时间</dt><dd>{selectedLog.time}</dd></div><div><dt>协议方向</dt><dd>{selectedLog.direction}</dd></div><div><dt>入口凭证</dt><dd>{selectedLog.credential}</dd></div><div><dt>结果</dt><dd>{selectedLog.status}</dd></div><div><dt>耗时</dt><dd>{selectedLog.durationMs} ms</dd></div><div><dt>错误摘要</dt><dd>{selectedLog.error ?? "-"}</dd></div></dl>
        <p className="action-feedback">请求和响应正文未记录；示例日志字段已脱敏。</p>
      </div>}
      <p className="helper-text page-footnote">示例字段已脱敏。真实日志、筛选与保留策略尚未接入。</p>
    </div>
  );
}
