import { WorkspaceState } from "../components/WorkspaceState";
import { useMemo, useState } from "react";
import { EmptyResult, FixtureNotice, PageHeader, SearchField } from "../components/PageHeader";
import { Button } from "../components/Button";
import { SegmentedControl } from "../components/SegmentedControl";
import { Modal } from "../components/Modal";
import { ProtocolFlow } from "../components/ProtocolBadge";
import { useWorkspace } from "../data/use-workspace";
import type { CallLog } from "../domain/types";

export function LogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const { data, error, loading } = useWorkspace();
  const logs = useMemo(() => data.logs.filter((log) => {
    const textMatches = `${log.id} ${log.model} ${log.credential} ${log.upstream} ${log.direction} ${log.error ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return textMatches && (status === "全部" || log.status.startsWith(status));
  }), [data.logs, query, status]);
  const hasFilter = query.length > 0 || status !== "全部";

  if (loading || error) return <WorkspaceState title="调用日志" loading={loading} error={error} />;

  return (
    <div className="page-content">
      <PageHeader title="调用日志" description="查看请求摘要；默认不包含请求或响应正文。" />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时日志 · 正文已脱敏" : "示例日志 · 非运行时记录"}</FixtureNotice>
      <div className="toolbar"><SearchField label="搜索调用日志" value={query} onChange={setQuery} />
        <SegmentedControl ariaLabel="按状态筛选" value={status} options={["全部", "成功", "失败"]} onChange={setStatus} />
        <span className="result-count">{logs.length} 条{data.meta.live ? "" : "示例"}</span>
        {hasFilter && <Button variant="tertiary" size="small" aria-label="清除筛选" onClick={() => { setQuery(""); setStatus("全部"); }}>清除筛选</Button>}
      </div>
      {logs.length ? <div className="table-scroll" role="region" aria-label="调用日志列表" tabIndex={0}><table>
        <thead><tr><th>时间 / 请求 ID</th><th>模型</th><th>入口凭证</th><th>协议方向</th><th>结果</th><th className="numeric">耗时</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{logs.map((log) => (
          <tr key={log.id}>
            <td><time>{log.time}</time><code className="cell-subtext">{log.id}</code></td>
            <td>{log.model}</td>
            <td>{log.credential}</td>
            <td><ProtocolFlow value={log.direction} /></td>
            <td><span className={`status-badge ${log.status.startsWith("成功") ? "status-positive" : "status-negative"}`}>{log.status}</span>{log.error && <span className="cell-subtext">{log.error}</span>}</td>
            <td className="numeric">{log.durationMs} ms</td>
            <td><Button variant="tertiary" size="small" aria-label={`查看 ${log.id}`} onClick={() => setSelectedLog(log)}>详情</Button></td>
          </tr>
        ))}</tbody>
      </table></div> : <EmptyResult>没有匹配的调用记录</EmptyResult>}
      {selectedLog && <Modal title={`请求 ${selectedLog.id} 详情`} onClose={() => setSelectedLog(null)}>
        <dl className="detail-grid"><div><dt>时间</dt><dd>{selectedLog.time}</dd></div><div><dt>协议方向</dt><dd>{selectedLog.direction}</dd></div><div><dt>入口凭证</dt><dd>{selectedLog.credential}</dd></div><div><dt>结果</dt><dd>{selectedLog.status}</dd></div><div><dt>耗时</dt><dd>{selectedLog.durationMs} ms</dd></div><div><dt>错误摘要</dt><dd>{selectedLog.error ?? "-"}</dd></div></dl>
        <p className="action-feedback">请求和响应正文未记录；日志字段已脱敏。</p>
      </Modal>}
      <p className="helper-text page-footnote">{data.meta.live ? "请求和响应正文未记录；运行时日志字段已脱敏。" : "示例字段已脱敏。真实日志、筛选与保留策略尚未接入。"}</p>
    </div>
  );
}
