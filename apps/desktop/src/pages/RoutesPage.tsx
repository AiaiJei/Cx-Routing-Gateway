import { useEffect, useState, type FormEvent } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { useWorkspace } from "../data/use-workspace";
import type { ModelRoute, Protocol } from "../domain/types";

export function RoutesPage() {
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const { data, error } = useWorkspace();
  const [routes, setRoutes] = useState(data.routes);
  useEffect(() => setRoutes(data.routes), [data.routes]);
  const upstreams = new Map(data.upstreams.map((upstream) => [upstream.id, upstream.name]));

  function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const route: ModelRoute = {
      id: `route-local-${Date.now()}`,
      alias: String(form.get("alias")).trim(),
      inboundProtocol: String(form.get("inbound")) as Protocol,
      upstreamId: String(form.get("upstream")),
      upstreamModel: String(form.get("model")).trim(),
      outboundProtocol: String(form.get("outbound")) as Protocol,
      enabled: true,
    };
    setRoutes((current) => [...current, route]);
    setFormOpen(false);
    setMessage("路由已添加到当前页面会话；刷新后不会保留，也未调用 Gateway。");
  }
  return (
    <div className="page-content">
      <PageHeader title="模型路由" description="将客户端请求协议映射到指定上游，再按原入站协议返回响应。" action={<button className="button-primary" type="button" onClick={() => setFormOpen((open) => !open)}>添加路由</button>} />
      <FixtureNotice>示例路由 · 未连接运行时</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      {message && <p className="action-feedback" role="status">{message}</p>}
      {formOpen && <form className="editor-form" onSubmit={addRoute}>
        <div className="form-heading"><h2 className="section-title">新增路由示例</h2><span className="helper-text">仅当前页面会话</span></div>
        <label>客户端模型别名<input name="alias" required maxLength={100} autoComplete="off" /></label>
        <label>客户端协议 / 入站<select name="inbound" defaultValue="Res"><option>Res</option><option>Mes</option><option>Chat</option></select></label>
        <label>目标上游<select name="upstream" defaultValue={data.upstreams[0]?.id}>{data.upstreams.map((upstream) => <option key={upstream.id} value={upstream.id}>{upstream.name}</option>)}</select></label>
        <label>上游协议 / 出站<select name="outbound" defaultValue="Chat"><option>Res</option><option>Mes</option><option>Chat</option></select></label>
        <label>上游模型<input name="model" required maxLength={120} autoComplete="off" /></label>
        <div className="form-actions"><button className="button-secondary" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="button-primary" type="submit">保存示例路由</button></div>
      </form>}
      <div className="table-scroll"><table>
        <thead><tr><th>客户端模型别名</th><th>客户端协议 / 入站</th><th>目标上游</th><th>上游协议 / 出站</th><th>响应协议</th><th>状态</th></tr></thead>
        <tbody>{routes.map((route) => <tr key={route.id}>
          <td><code>{route.alias}</code><span className="cell-subtext">映射到 {route.upstreamModel}</span></td>
          <td>{route.inboundProtocol} 入站</td>
          <td>{upstreams.get(route.upstreamId) ?? "未匹配上游"}</td>
          <td>{route.outboundProtocol}</td>
          <td>{route.inboundProtocol} 响应</td>
          <td>{route.enabled ? "已启用（示例）" : "已停用（示例）"}</td>
        </tr>)}</tbody>
      </table></div>
      <section className="direction-example" aria-label="协议方向示例">
        <span className="field-label">协议转换示例</span>
        <p>Res 入站 → Chat 出站 → Res 响应</p>
        <span className="helper-text">响应始终转换回本次请求的入站协议；所有路由均为静态示例。</span>
      </section>
    </div>
  );
}
