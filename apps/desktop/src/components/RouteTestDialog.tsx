import { useState, type FormEvent } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ProtocolBadge } from "./ProtocolBadge";
import type { ModelRoute, RouteTestResult } from "../domain/types";

export function RouteTestDialog({
  route,
  targetNames,
  onClose,
  testRoute,
}: {
  route: ModelRoute;
  targetNames: string[];
  onClose: () => void;
  testRoute: (routeId: string, prompt: string) => Promise<RouteTestResult>;
}) {
  const [prompt, setPrompt] = useState("请回复OK");
  const [result, setResult] = useState<RouteTestResult | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !prompt.trim()) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const response = await testRoute(route.id, prompt.trim());
      setResult(response);
      setError(response.error ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace(/^Error invoking remote method '[^']+': Error:\s*/, "") : "测试请求失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title={`测试调用 · ${route.alias}`} onClose={onClose} canClose={!sending}>
      <form className="route-test-form" onSubmit={(event) => void submit(event)}>
        <div className="route-test-context" aria-label="测试路由信息">
          <div><span className="field-label">客户端协议</span><ProtocolBadge protocol={route.inboundProtocol} /></div>
          <div><span className="field-label">出站协议</span><ProtocolBadge protocol={route.outboundProtocol} /></div>
          <div className="route-test-targets"><span className="field-label">上游优先级</span><ol>{targetNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ol></div>
        </div>
        <label className="route-test-prompt" htmlFor="route-test-prompt">
          <span className="route-test-prompt-label"><span className="field-label">发送内容</span><span className="cell-subtext">{prompt.length}/2000</span></span>
          <textarea id="route-test-prompt" aria-label="发送内容" value={prompt} maxLength={2000} rows={4} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <p className="action-feedback route-test-disclosure" role="note">将通过本机 Gateway 向此路由的上游发送真实请求并写入调用日志；每次输出最多 256 tokens。上游服务可能会对此请求计费。</p>
        {sending && <p className="helper-text" role="status">请求正在经过本机 Gateway 和上游模型处理…</p>}
        {error && <p className="action-feedback route-test-error" role="alert">{error}</p>}
        {result && <section className="route-test-result" aria-label="真实请求结果" role="status">
          <div className="route-test-result-heading"><strong>{result.error ? "请求失败" : "模型响应"}</strong><span className={`status-badge ${result.error ? "status-negative" : "status-positive"}`}>HTTP {result.status}</span></div>
          {result.error ? <p className="route-test-result-error">{result.error}</p> : <pre>{result.text || "模型返回了空文本响应。"}</pre>}
          <dl className="route-test-metadata"><div><dt>请求 ID</dt><dd><code>{result.requestId || "-"}</code></dd></div><div><dt>耗时</dt><dd>{result.durationMs} ms</dd></div></dl>
        </section>}
        <div className="form-actions">
          <Button variant="tertiary" disabled={sending} onClick={onClose}>关闭</Button>
          <Button variant="primary" type="submit" disabled={sending || !prompt.trim()}>
            {sending ? <><span className="route-test-spinner" aria-hidden="true" />请求中…</> : "发送测试请求"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
