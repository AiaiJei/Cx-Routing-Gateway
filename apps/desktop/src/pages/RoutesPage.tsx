import { useEffect, useState, type FormEvent } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { CustomSelect } from "../components/CustomSelect";
import { ProtocolBadge } from "../components/ProtocolBadge";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { ModelRoute, Protocol } from "../domain/types";

export function RoutesPage() {
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ModelRoute | null>(null);
  const [selectedUpstreamIds, setSelectedUpstreamIds] = useState<string[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [inboundProtocol, setInboundProtocol] = useState<Protocol>("Res");
  const [outboundProtocol, setOutboundProtocol] = useState<Protocol>("Chat");
  const [modelSelections, setModelSelections] = useState<Record<string, string[]>>({});
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [statusClasses, setStatusClasses] = useState<number[]>([4, 5]);
  const { data, error } = useWorkspace();
  const [routes, setRoutes] = useState(data.routes);
  useEffect(() => setRoutes(data.routes), [data.routes]);
  const upstreams = new Map(data.upstreams.map((upstream) => [upstream.id, upstream.name]));

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const targets = selectedUpstreamIds.flatMap(upstreamId =>
    (modelSelections[upstreamId] || []).map(modelId => ({ upstreamId, modelId })));
  const ready = modelsLoaded && selectedUpstreamIds.length > 0 && selectedUpstreamIds.every(id => modelSelections[id]?.length);

  function openForm(route: ModelRoute | null) {
    const initial: Record<string, string[]> = {};
    for (const target of route?.targets ?? []) (initial[target.upstreamId] ??= []).push(target.upstreamModel);
    setEditingRoute(route);
    setModelSelections(initial);
    setSelectedUpstreamIds(Object.keys(initial));
    setModelsLoaded(!!route);
    setInboundProtocol(route?.inboundProtocol ?? "Res");
    setOutboundProtocol(route?.outboundProtocol ?? "Chat");
    setFailureThreshold(route?.failover?.failureThreshold ?? 3);
    setStatusClasses(route?.failover?.statusClasses ?? [4, 5]);
    setFormError("");
    setFormOpen(true);
  }

  async function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    setFormError("");
    setSaving(true);
    try {
      if (data.meta.live) {
        if (!defaultWorkspaceClient.saveModelRoutes) throw new Error("无法连接本机路由服务");
        if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 100 || !statusClasses.length) throw new Error("请设置 1 至 100 次失败，并选择至少一类错误状态码。");
        await defaultWorkspaceClient.saveModelRoutes({ inboundProtocol, outboundProtocol, targets, editId: editingRoute?.id, failover: { failureThreshold, statusClasses } });
        setFormOpen(false);
        setMessage(`已保存 ${targets.length} 个上游模型配置。`);
        try { setRoutes((await defaultWorkspaceClient.getWorkspace()).routes); }
        catch { setMessage("路由已保存，请重新打开此页刷新列表。"); }
      } else {
        const groups = new Map<string, { upstreamId: string; upstreamModel: string }[]>();
        for (const { upstreamId, modelId } of targets) groups.set(modelId, [...(groups.get(modelId) || []), { upstreamId, upstreamModel: modelId }]);
        const additions = [...groups].map(([modelId, modelTargets]) => ({ id: crypto.randomUUID(), alias: modelId, inboundProtocol, outboundProtocol, targets: modelTargets, enabled: true, failover: { failureThreshold, statusClasses } }));
        setRoutes(current => [...current, ...additions]);
        setMessage(`已添加 ${targets.length} 条预览路由，刷新后不会保留。`);
        setFormOpen(false);
      }
    } catch (error) { setFormError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error:\s*/, "") : "保存路由失败"); }
    finally { setSaving(false); }
  }

  async function deleteRoute(id: string) {
    if (!data.meta.live || !defaultWorkspaceClient.deleteRoute) return;
    await defaultWorkspaceClient.deleteRoute(id);
    setRoutes((current) => current.filter((item) => item.id !== id));
    setMessage("路由已删除。");
  }

  async function toggleRoute(route: ModelRoute) {
    if (!data.meta.live || !defaultWorkspaceClient.updateRoute) return;
    await defaultWorkspaceClient.updateRoute(route.id, { enabled: !route.enabled });
    setRoutes((current) => current.map((item) => item.id === route.id ? { ...item, enabled: !item.enabled } : item));
    setMessage(route.enabled ? "路由已停用。" : "路由已启用。");
  }
  return (
    <div className="page-content">
      <PageHeader title="模型路由" description="将客户端请求协议映射到指定上游，再按原入站协议返回响应。" action={<Button variant="primary" onClick={() => openForm(null)}>添加路由</Button>} />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时路由" : "浏览器预览路由"}</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      {message && <p className="action-feedback" role="status">{message}</p>}
      {formOpen && <Modal title={editingRoute ? "编辑路由" : "新增路由"} onClose={() => { if (!saving) setFormOpen(false); }}><form className="modal-form" onSubmit={addRoute}>
        <span className="helper-text">选择多个模型，以模型原名创建路由；客户端直接使用模型名调用。</span>
        <label>客户端协议 / 入站<CustomSelect ariaLabel="客户端协议 / 入站" name="inbound" value={inboundProtocol} options={["Res", "Mes", "Chat"]} onChange={(value) => setInboundProtocol(value as Protocol)} /></label>
        <fieldset className="upstream-picker"><legend>选择上游服务</legend>{data.upstreams.map((upstream) => <label className="checkbox-row" key={upstream.id}><input type="checkbox" aria-label={upstream.name} checked={selectedUpstreamIds.includes(upstream.id)} onChange={(event) => setSelectedUpstreamIds((current) => event.target.checked ? [...current, upstream.id] : current.filter((id) => id !== upstream.id))} />{upstream.name}<span className="cell-subtext">{upstream.models.length} 个{data.meta.live ? "已发现" : "预览"}模型</span></label>)}<Button variant="secondary" size="small" disabled={!selectedUpstreamIds.length} onClick={() => setModelsLoaded(true)}>加载已选上游模型</Button></fieldset>
        {modelsLoaded && selectedUpstreamIds.map(id => {
          const upstream = data.upstreams.find(item => item.id === id);
          if (!upstream) return null;
          const values = modelSelections[id] ?? [];
          const options = [...new Set([...upstream.models, ...values])];
          return <div className="route-select-field" key={id}><span>{upstream.name} 模型</span>
            <CustomSelect multiple ariaLabel={`${upstream.name} 模型`} value={values} options={options} placeholder="选择模型（可多选）"
              onChange={models => setModelSelections(current => ({ ...current, [id]: models }))} />
          </div>;
        })}
        {selectedUpstreamIds.length > 1 && <fieldset className="upstream-picker"><legend>上游优先级</legend><span className="helper-text">顺序靠前的上游优先处理请求；失败达到阈值后切换到下一个。</span>{selectedUpstreamIds.map((id, index) => <div className="priority-row" key={id}><span>{index + 1}. {upstreams.get(id) ?? id}</span><div className="priority-actions"><Button variant="tertiary" size="small" aria-label={`提高 ${upstreams.get(id) ?? id} 优先级`} disabled={index === 0} onClick={() => setSelectedUpstreamIds(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>上移</Button><Button variant="tertiary" size="small" aria-label={`降低 ${upstreams.get(id) ?? id} 优先级`} disabled={index === selectedUpstreamIds.length - 1} onClick={() => setSelectedUpstreamIds(current => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}>下移</Button></div></div>)}</fieldset>}
        <fieldset className="upstream-picker"><legend>故障切换</legend><label className="failover-threshold">连续失败次数<input type="number" aria-label="连续失败次数" min="1" max="100" value={failureThreshold} onChange={event => setFailureThreshold(Number(event.target.value))} /></label><div className="failover-statuses">{[4, 5].map(value => <label key={value}><input type="checkbox" checked={statusClasses.includes(value)} onChange={event => setStatusClasses(current => event.target.checked ? [...current, value].sort() : current.filter(item => item !== value))} />{value}xx</label>)}</div><span className="helper-text">连接失败和超时也计入；切换后冷却 60 秒，再尝试较高优先级。当前失败请求不会自动重试。</span></fieldset>
        {formError && <p role="alert" className="action-feedback">{formError}</p>}
        <label>上游协议 / 出站<CustomSelect ariaLabel="上游协议 / 出站" name="outbound" value={outboundProtocol} options={["Res", "Mes", "Chat"]} onChange={(value) => setOutboundProtocol(value as Protocol)} /></label>
        <div className="form-actions"><Button variant="tertiary" disabled={saving} onClick={() => setFormOpen(false)}>取消</Button><Button variant="primary" type="submit" disabled={!ready || saving}>{saving ? "保存中…" : "保存路由"}</Button></div>
      </form></Modal>}
      <div className="table-scroll"><table>
        <thead><tr><th>模型</th><th>客户端协议 / 入站</th><th>目标上游</th><th>上游协议 / 出站</th><th>响应协议</th><th>状态</th></tr></thead>
        <tbody>{routes.map((route) => <tr key={route.id}>
          <td><code>{route.targets[0]?.upstreamModel ?? route.alias}</code>{route.targets[0] && route.alias !== route.targets[0].upstreamModel && <span className="cell-subtext">现有调用名：{route.alias}</span>}</td>
          <td><ProtocolBadge protocol={route.inboundProtocol}>{route.inboundProtocol} 入站</ProtocolBadge></td>
          <td>{route.targets.map((target, index) => <span className="route-target" key={`${target.upstreamId}:${target.upstreamModel}`}>{route.targets.length > 1 && `${index + 1}. `}{upstreams.get(target.upstreamId) ?? "未匹配上游"}</span>)}{route.targets.length > 1 && <span className="cell-subtext">连续失败 {route.failover?.failureThreshold ?? 3} 次后切换 · {(route.failover?.statusClasses ?? [4, 5]).map(value => `${value}xx`).join(" / ")}</span>}</td>
          <td><ProtocolBadge protocol={route.outboundProtocol} /></td>
          <td><ProtocolBadge protocol={route.inboundProtocol}>{route.inboundProtocol} 响应</ProtocolBadge></td>
          <td><span className={`status-badge ${data.meta.live && route.enabled ? "status-positive" : "status-neutral"}`}>{route.enabled ? (data.meta.live ? "已启用" : "已启用（预览）") : (data.meta.live ? "已停用" : "已停用（预览）")}</span>{data.meta.live && <span className="row-actions"><Button variant="tertiary" size="small" onClick={() => openForm(route)}>编辑</Button><Button variant="tertiary" size="small" onClick={() => void toggleRoute(route)}>{route.enabled ? "停用" : "启用"}</Button><Button variant="danger" size="small" onClick={() => void deleteRoute(route.id)}>删除</Button></span>}</td>
        </tr>)}</tbody>
      </table></div>
      <section className="direction-example" aria-label="协议方向示例">
        <span className="field-label">协议转换示例</span>
        <p>Res 入站 → Chat 出站 → Res 响应</p>
        <span className="helper-text">响应会转换回本次请求的入站协议。</span>
      </section>
    </div>
  );
}
