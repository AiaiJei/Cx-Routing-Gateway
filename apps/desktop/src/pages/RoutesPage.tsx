import { useWorkspaceCollection } from "../data/use-workspace-collection";
import { WorkspaceState } from "../components/WorkspaceState";
import { useState, type FormEvent } from "react";
import { EmptyResult, FixtureNotice, PageHeader } from "../components/PageHeader";
import { ProtocolExplanation } from "../components/ProtocolExplanation";
import { RouteTargets } from "../components/RouteTargets";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { CustomSelect } from "../components/CustomSelect";
import { ProtocolBadge } from "../components/ProtocolBadge";
import { RouteTestDialog } from "../components/RouteTestDialog";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { ModelRoute, Protocol } from "../domain/types";

export function RoutesPage() {
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ModelRoute | null>(null);
  const [testingRoute, setTestingRoute] = useState<ModelRoute | null>(null);
  const [selectedUpstreamIds, setSelectedUpstreamIds] = useState<string[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [inboundProtocol, setInboundProtocol] = useState<Protocol>("Res");
  const [outboundProtocol, setOutboundProtocol] = useState<Protocol>("Chat");
  const [modelSelections, setModelSelections] = useState<Record<string, string[]>>({});
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [statusClasses, setStatusClasses] = useState<number[]>([4, 5]);
  const { data, error, loading } = useWorkspace();
  const [routes, setRoutes] = useWorkspaceCollection(data.routes);
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
  if (loading || error) return <WorkspaceState title="模型路由" loading={loading} error={error} />;

  return (
    <div className="page-content routes-page">
      <PageHeader title="模型路由" description="将客户端请求映射到上游，响应返回原入站协议。" action={<Button variant="primary" onClick={() => openForm(null)}><span className="button-plus" aria-hidden="true">+</span>添加路由</Button>} />
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
      <section className="route-list-section" aria-labelledby="route-list-title">
      <div className="section-heading"><div className="section-title-row"><h2 id="route-list-title" className="section-title">路由配置</h2><span className="result-count">{routes.length} 条路由</span></div><FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时路由" : "浏览器预览路由"}</FixtureNotice></div>
      {routes.length ? <div className="table-scroll" role="region" aria-label="模型路由列表" tabIndex={0}><table className={`routes-table${data.meta.live ? " has-actions" : ""}`}>
        <colgroup><col className="route-col-model" /><col className="route-col-inbound" /><col className="route-col-upstream" /><col className="route-col-outbound" /><col className="route-col-response" /><col className="route-col-state" />{data.meta.live && <col className="route-col-actions" />}</colgroup>
        <thead><tr><th aria-label="模型">模型 / 调用名</th><th aria-label="客户端协议 / 入站">入站协议</th><th>目标上游</th><th aria-label="上游协议 / 出站">出站协议</th><th>响应协议</th><th>状态</th>{data.meta.live && <th className="row-actions-heading">操作</th>}</tr></thead>
        <tbody>{routes.map((route) => <tr key={route.id}>
          <td><strong className="route-model-name">{route.targets[0]?.upstreamModel ?? route.alias}</strong>{route.targets[0] && route.alias !== route.targets[0].upstreamModel && <span className="cell-subtext">调用名：{route.alias}</span>}</td>
          <td><ProtocolBadge protocol={route.inboundProtocol} /></td>
          <td><RouteTargets route={route} upstreams={data.upstreams} /></td>
          <td><ProtocolBadge protocol={route.outboundProtocol} /></td>
          <td><ProtocolBadge protocol={route.inboundProtocol} /></td>
          <td className="route-state-cell"><span className={`route-state ${data.meta.live && route.enabled ? "is-enabled" : ""}`}><span className="route-state-mark" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none">{route.enabled ? <path d="m3 6 2 2 4-4" /> : <path d="M3 6h6" />}</svg></span>{route.enabled ? "已启用" : "已停用"}</span>{!data.meta.live && <span className="cell-subtext route-preview-state">预览状态</span>}</td>{data.meta.live && <td className="row-actions-cell"><div className="row-actions" role="group" aria-label={`${route.alias} 操作`}>{route.enabled && <Button variant="accent" size="small" className="route-action-test" aria-label={`测试调用 ${route.alias}`} onClick={() => setTestingRoute(route)}><svg className="route-test-play-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.8c0-.6.7-.9 1.2-.6l6 3.8a.7.7 0 0 1 0 1.2l-6 3.8a.7.7 0 0 1-1.2-.6z" fill="currentColor" /></svg>测试调用</Button>}<Button variant="secondary" size="small" className="route-action-edit" onClick={() => openForm(route)}>编辑</Button><Button variant="secondary" size="small" className="route-action-toggle" onClick={() => void toggleRoute(route)}>{route.enabled ? "停用" : "启用"}</Button><Button variant="danger" size="small" className="route-action-delete" onClick={() => void deleteRoute(route.id)}>删除</Button></div></td>}
        </tr>)}</tbody>
      </table></div> : <EmptyResult>还没有模型路由，添加路由以连接客户端与上游。</EmptyResult>}
      </section>
      {testingRoute && <RouteTestDialog route={testingRoute} targetNames={testingRoute.targets.map((target) => upstreams.get(target.upstreamId) ?? "未匹配上游")} onClose={() => setTestingRoute(null)} testRoute={(routeId, prompt) => {
        if (!defaultWorkspaceClient.testRoute) return Promise.reject(new Error("当前运行时不支持真实测试调用"));
        return defaultWorkspaceClient.testRoute(routeId, prompt);
      }} />}
      <ProtocolExplanation />
      {!data.meta.live && <p className="helper-text">此处为示例路由，未连接实际上游服务。</p>}
    </div>
  );
}
