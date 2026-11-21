import type { CallLog, Protocol, RequestTokens } from "../domain/types";
import { formatDuration, formatMetric, formatRequestTime, tokenFields } from "../domain/request-log";
import { ProtocolBadge } from "./ProtocolBadge";
import { Tooltip } from "./Tooltip";

type MainToken = "input" | "output" | "cacheRead" | "cacheWrite";
function TokenIcon({ kind }: { kind: MainToken }) {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "input" ? <><path d="M10 2v10m-3-3 3 3 3-3M4 12v4h12v-4" /></> : kind === "output" ? <><path d="M10 12V2m-3 3 3-3 3 3M4 12v4h12v-4" /></> : <><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v9c0 1 2 2 5 2M13 4v3M3 8c0 1 2 2 5 2" />{kind === "cacheRead" ? <path d="M10 12h8m-3-3 3 3-3 3" /> : <path d="M18 12h-8m3-3-3 3 3 3" />}</>}
  </svg>;
}

export function RequestTime({ log }: { log: CallLog }) {
  const display = formatRequestTime(log.time);
  return <Tooltip label={`请求时间 ${display}，查看请求 ID`} content={<>
    <span className="tooltip-heading">请求 ID</span><code className="request-id">{log.id}</code>
    <dl className="tooltip-facts"><div><dt>原始时间</dt><dd>{log.time || "—"}</dd></div><div><dt>显示时区</dt><dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd></div></dl>
  </>}><time dateTime={display === "—" ? undefined : log.time}>{display}</time></Tooltip>;
}

export function RequestProtocol({ log }: { log: CallLog }) {
  const inbound = log.direction.split(" → ")[0];
  return <Tooltip label={`入站协议 ${inbound}，查看协议方向`} content={<>
    <span className="tooltip-heading">协议方向</span><p className="tooltip-flow">{log.direction}</p>
    <p className="helper-text">入站 → 上游 → 响应</p><dl className="tooltip-facts"><div><dt>上游</dt><dd>{log.upstream || "—"}</dd></div></dl>
  </>}>{["Res", "Mes", "Chat"].includes(inbound) ? <ProtocolBadge protocol={inbound as Protocol} /> : "—"}</Tooltip>;
}

export function TokenDetails({ tokens }: { tokens?: RequestTokens }) {
  return <><dl className="tooltip-facts token-facts">{tokenFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatMetric(tokens?.[key])}</dd></div>)}</dl>
    <p className="helper-text">— 表示未提供。缓存计数按上游口径，可能已计入输入；总量不重复累加缓存。</p></>;
}

export function RequestTokenSummary({ log }: { log: CallLog }) {
  const primary = tokenFields.slice(0, 4);
  return <Tooltip className="token-trigger" label={`Token 用量：${primary.map(([key, label]) => `${label} ${formatMetric(log.tokens?.[key])}`).join("，")}，查看明细`} content={<><span className="tooltip-heading">Token 用量</span><TokenDetails tokens={log.tokens} /></>}>
    <span className="token-summary">{primary.map(([key, label]) => <span className="token-value" key={key}><TokenIcon kind={key as MainToken} /><span className="sr-only">{label} </span><span>{formatMetric(log.tokens?.[key])}</span></span>)}</span>
  </Tooltip>;
}

export function RequestDuration({ log }: { log: CallLog }) {
  return <Tooltip label="请求耗时，查看首字和总耗时计时口径" content={<>
    <span className="tooltip-heading">耗时口径</span>
    <dl className="tooltip-facts">
      <div><dt>首字</dt><dd>从网关收到请求到首个有效生成内容（文本、推理、拒绝或工具内容），不等同于首个网络字节。</dd></div>
      <div><dt>总耗时</dt><dd>从网关收到请求到响应完成或失败，包含网关处理时间。</dd></div>
    </dl>
  </>}>
    <span className="request-duration"><span><span className="duration-label">首字</span><span>{formatDuration(log.stream ? log.firstTokenMs : undefined)}</span></span><span><span className="duration-label">总耗时</span><span>{formatDuration(log.durationMs)}</span></span></span>
  </Tooltip>;
}
