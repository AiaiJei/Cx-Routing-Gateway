import { WorkspaceState } from "../components/WorkspaceState";
import { useState } from "react";
import { EmptyResult, FixtureNotice, PageHeader, SearchField } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tooltip } from "../components/Tooltip";
import { SegmentedControl } from "../components/SegmentedControl";
import { Modal } from "../components/Modal";
import { RequestDuration, RequestProtocol, RequestTime, RequestTokenSummary, TokenDetails } from "../components/RequestLogCells";
import { formatDuration, formatRequestTime, requestType } from "../domain/request-log";
import { requestLogDateRanges, selectRequestLogs, type RequestLogDateRange } from "../domain/request-log-filter";
import { useWorkspace } from "../data/use-workspace";
import type { CallLog } from "../domain/types";
import "../styles/request-logs.css";

export function LogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [dateRange, setDateRange] = useState<RequestLogDateRange>("实时");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const { data, error, loading, refresh, refreshing, refreshError } = useWorkspace(undefined, { pollIntervalMs: 1500 });
  const logs = selectRequestLogs(data.logs, { query, status, dateRange });
  const hasFilter = query.length > 0 || status !== "全部" || dateRange !== "实时";

  const refreshAction = <Button aria-label="刷新请求日志" aria-busy={refreshing} disabled={refreshing} onClick={refresh}>{refreshing ? "刷新中…" : "刷新"}</Button>;
  const statusDetails = (log: CallLog) => [
    log.httpStatus !== undefined ? `HTTP ${log.httpStatus}` : undefined,
    log.upstreamStatus !== undefined ? `上游 HTTP ${log.upstreamStatus}` : undefined,
    log.gatewayStatus !== undefined ? `网关 HTTP ${log.gatewayStatus}` : undefined,
    log.error,
  ].filter(Boolean).join(' · ') || '—';

  if (loading) return <WorkspaceState title="请求日志" loading={loading} error={error} />;
  if (error) return <div className="page-content">
    <PageHeader title="请求日志" description="查看请求摘要、Token 用量与响应耗时。" action={refreshAction} />
    <div className="workspace-error" role="alert"><p>请求日志读取失败：{error}</p><p className="helper-text">将自动重试，也可点击刷新。</p></div>
  </div>;

  return (
    <div className="page-content">
      <PageHeader title="请求日志" description="查看请求摘要、Token 用量与响应耗时。" action={refreshAction} />
      {refreshError && <p className="action-feedback" role="alert">刷新失败：{refreshError}。当前保留上次读取的日志，将自动重试。</p>}
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时日志 · 正文已脱敏" : "示例日志 · 非运行时记录"}</FixtureNotice>
      <div className="toolbar"><SearchField label="搜索请求日志" value={query} onChange={setQuery} />
        <SegmentedControl ariaLabel="按状态筛选" value={status} options={["全部", "成功", "失败"]} onChange={setStatus} />
        <SegmentedControl ariaLabel="按日期筛选" value={dateRange} options={[...requestLogDateRanges]} onChange={(value) => setDateRange(value as RequestLogDateRange)} />
        <span className="result-count">{logs.length} 条{data.meta.live ? "" : "示例"}</span>
        {hasFilter && <Button variant="tertiary" size="small" aria-label="清除筛选" onClick={() => { setQuery(""); setStatus("全部"); setDateRange("实时"); }}>清除筛选</Button>}
      </div>
      {logs.length ? <div className="table-scroll" role="region" aria-label="请求日志列表" tabIndex={0}><table className="logs-table">
        <colgroup aria-hidden="true"><col className="log-col-time" /><col className="log-col-model" /><col className="log-col-source" /><col className="log-col-reasoning" /><col className="log-col-inbound" /><col className="log-col-type" /><col className="log-col-tokens" /><col className="log-col-status" /><col className="log-col-duration" /><col className="log-col-actions" /></colgroup>
        <thead><tr><th scope="col">请求时间</th><th scope="col">模型</th><th scope="col">来源</th><th scope="col">推理</th><th scope="col">入站</th><th scope="col">类型</th><th scope="col" className="numeric">Token</th><th scope="col">状态</th><th scope="col" className="numeric">耗时</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{logs.map((log) => (
          <tr key={log.id}>
            <td><RequestTime log={log} /></td>
            <td className="log-model">{log.model || "—"}</td>
            <td>{log.upstream}</td>
            <td>{log.reasoning ?? "-"}</td>
            <td><RequestProtocol log={log} /></td>
            <td className="log-type">{requestType(log)}</td>
            <td className="numeric"><RequestTokenSummary log={log} /></td>
            <td className="log-status"><Tooltip label={`状态 ${log.status}，${statusDetails(log)}`} content={<><span className="tooltip-heading">状态详情</span><p className="helper-text">{statusDetails(log)}</p></>}><span className={`status-badge ${log.status.startsWith("成功") ? "status-positive" : "status-negative"}`}>{log.status}</span></Tooltip></td>
            <td className="numeric"><RequestDuration log={log} /></td>
            <td><Button variant="tertiary" size="small" aria-label={`查看 ${log.id}`} onClick={() => setSelectedLog(log)}>详情</Button></td>
          </tr>
        ))}</tbody>
      </table></div> : <EmptyResult>没有匹配的请求记录</EmptyResult>}
      {selectedLog && <Modal title={`请求 ${selectedLog.id} 详情`} onClose={() => setSelectedLog(null)}>
        <dl className="detail-grid">
          <div><dt>请求时间</dt><dd>{formatRequestTime(selectedLog.time)}</dd></div>
          <div><dt>协议方向</dt><dd>{selectedLog.direction}</dd></div>
          <div><dt>入口凭证</dt><dd>{selectedLog.credential}</dd></div>
          <div><dt>推理</dt><dd>{selectedLog.reasoning ?? "-"}</dd></div>
          <div><dt>状态</dt><dd>{selectedLog.status}</dd></div>
          <div><dt>类型</dt><dd>{requestType(selectedLog)}</dd></div>
          <div><dt>首字</dt><dd>{formatDuration(selectedLog.stream ? selectedLog.firstTokenMs : undefined)}</dd></div>
          <div><dt>总耗时</dt><dd>{formatDuration(selectedLog.durationMs)}</dd></div>
          <div><dt>错误信息</dt><dd>{statusDetails(selectedLog)}</dd></div>
        </dl>
        <section className="log-detail-tokens" aria-label="Token 用量"><h3 className="tooltip-heading">Token 用量</h3><TokenDetails tokens={selectedLog.tokens} /></section>
        <p className="action-feedback">请求和响应正文未记录；日志字段已脱敏。</p>
      </Modal>}
      <p className="helper-text page-footnote">{data.meta.live ? "请求和响应正文未记录；运行时日志字段已脱敏。" : "示例字段已脱敏。"} 首字为首次生成内容的等待时间；非流请求或未采集的指标显示 —。</p>
    </div>
  );
}
