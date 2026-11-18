import { useEffect, useState, type FormEvent } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { CustomSelect } from "../components/CustomSelect";
import { useWorkspace } from "../data/use-workspace";
import type { ModelRoute, Protocol } from "../domain/types";

export function RoutesPage() {
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedUpstreamIds, setSelectedUpstreamIds] = useState<string[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [inboundProtocol, setInboundProtocol] = useState<Protocol>("Res");
  const [outboundProtocol, setOutboundProtocol] = useState<Protocol>("Chat");
  const [modelSelections, setModelSelections] = useState<Record<string, string>>({});
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
      targets: selectedUpstreamIds.map((upstreamId) => ({ upstreamId, upstreamModel: String(form.get(`model-${upstreamId}`)).trim() })),
      outboundProtocol: String(form.get("outbound")) as Protocol,
      enabled: true,
    };
    setRoutes((current) => [...current, route]);
    setFormOpen(false);
    setSelectedUpstreamIds([]);
    setModelsLoaded(false);
    setInboundProtocol("Res");
    setOutboundProtocol("Chat");
    setModelSelections({});
    setMessage("路由已添加到当前页面会话；刷新后不会保留，也未调用 Gateway。");
  }
  return (
    <div className="page-content">
      <PageHeader title="模型路由" description="将客户端请求协议映射到指定上游，再按原入站协议返回响应。" action={<button className="button-primary" type="button" onClick={() => setFormOpen((open) => !open)}>添加路由</button>} />
      <FixtureNotice>示例路由 · 未连接运行时</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      {message && <p className="action-feedback" role="status">{message}</p>}
      {formOpen && <Modal title="新增路由示例" onClose={() => setFormOpen(false)}><form className="modal-form" onSubmit={addRoute}>
        <span className="helper-text">仅当前页面会话；一个客户端模型可以由多个上游服务承载。</span>
        <label>客户端模型别名<input name="alias" required maxLength={100} autoComplete="off" /></label>
        <label>客户端协议 / 入站<CustomSelect ariaLabel="客户端协议 / 入站" name="inbound" value={inboundProtocol} options={["Res", "Mes", "Chat"]} onChange={(value) => setInboundProtocol(value as Protocol)} /></label>
        <fieldset className="upstream-picker"><legend>选择上游服务</legend>{data.upstreams.map((upstream) => <label className="checkbox-row" key={upstream.id}><input type="checkbox" aria-label={upstream.name} checked={selectedUpstreamIds.includes(upstream.id)} onChange={(event) => setSelectedUpstreamIds((current) => event.target.checked ? [...current, upstream.id] : current.filter((id) => id !== upstream.id))} />{upstream.name}<span className="cell-subtext">{upstream.models.length} 个示例模型</span></label>)}<button className="button-secondary" type="button" disabled={!selectedUpstreamIds.length} onClick={() => setModelsLoaded(true)}>加载已选上游模型</button></fieldset>
        {modelsLoaded && selectedUpstreamIds.map((upstreamId) => { const upstream = data.upstreams.find((item) => item.id === upstreamId); return upstream ? <label key={upstream.id}>{upstream.name} 模型<CustomSelect ariaLabel={`${upstream.name} 模型`} name={`model-${upstream.id}`} value={modelSelections[upstream.id] ?? ""} options={upstream.models} placeholder="选择模型" onChange={(value) => setModelSelections((current) => ({ ...current, [upstream.id]: value }))} /></label> : null; })}
        <label>上游协议 / 出站<CustomSelect ariaLabel="上游协议 / 出站" name="outbound" value={outboundProtocol} options={["Res", "Mes", "Chat"]} onChange={(value) => setOutboundProtocol(value as Protocol)} /></label>
        <div className="form-actions"><button className="button-secondary" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="button-primary" type="submit" disabled={!modelsLoaded || !selectedUpstreamIds.length}>保存示例路由</button></div>
      </form></Modal>}
      <div className="table-scroll"><table>
        <thead><tr><th>客户端模型别名</th><th>客户端协议 / 入站</th><th>目标上游</th><th>上游协议 / 出站</th><th>响应协议</th><th>状态</th></tr></thead>
        <tbody>{routes.map((route) => <tr key={route.id}>
          <td><code>{route.alias}</code><span className="cell-subtext">{route.targets.map((target) => target.upstreamModel).join("、")}</span></td>
          <td>{route.inboundProtocol} 入站</td>
          <td>{route.targets.map((target) => upstreams.get(target.upstreamId) ?? "未匹配上游").join("、")}</td>
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
