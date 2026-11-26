import { useWorkspaceCollection } from "../data/use-workspace-collection";
import { WorkspaceState } from "../components/WorkspaceState";
import { useState } from "react";
import { EmptyResult, FixtureNotice, PageHeader } from "../components/PageHeader";
import { ProtocolExplanation } from "../components/ProtocolExplanation";
import { RouteTargets } from "../components/RouteTargets";
import { Button } from "../components/Button";
import { ModelFamilyFilter } from "../components/ModelFamilyFilter";
import { getRouteModelFamily, type ModelFamilySelection } from "../domain/model-family";
import { ProtocolBadge } from "../components/ProtocolBadge";
import { RouteTestDialog } from "../components/RouteTestDialog";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { ModelRoute, ModelRouteSelection } from "../domain/types";
import { RouteEditor } from "../components/RouteEditor";
import { reasoningRangeLabel } from "../domain/route-selection";

export function RoutesPage() {
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ModelRoute | null>(null);
  const [testingRoute, setTestingRoute] = useState<ModelRoute | null>(null);
  const { data, error, loading } = useWorkspace();
  const [routes, setRoutes] = useWorkspaceCollection(data.routes);
  const [routeFamily, setRouteFamily] = useState<ModelFamilySelection>("all");
  const routeFamilies = routes.map(getRouteModelFamily);
  const visibleRoutes = routes.filter((_, index) => routeFamily === "all" || routeFamilies[index] === routeFamily);
  const upstreams = new Map(data.upstreams.map((upstream) => [upstream.id, upstream.name]));

  function openForm(route: ModelRoute | null) {
    setEditingRoute(route);
    setFormOpen(true);
  }

  async function saveRoutes(selection: ModelRouteSelection) {
    if (data.meta.live) {
      if (!defaultWorkspaceClient.saveModelRoutes) throw new Error("无法连接本机路由服务");
      await defaultWorkspaceClient.saveModelRoutes(selection);
      setFormOpen(false);
      const codexReminder = "如需更新 Codex 模型能力，请到 Codex 页面重新保存并启用网关，再完整退出并重启 Codex。";
      setMessage(`已保存 ${new Set(selection.targets.map(target => target.modelId)).size} 个统一模型。${codexReminder}`);
      try { setRoutes((await defaultWorkspaceClient.getWorkspace()).routes); }
      catch { setMessage(`路由已保存，请重新打开此页刷新列表。${codexReminder}`); }
      return;
    }
    const groups = new Map<string, ModelRoute["targets"]>();
    for (const { upstreamId, modelId } of selection.targets) groups.set(modelId, [...(groups.get(modelId) ?? []), { upstreamId, upstreamModel: modelId }]);
    const additions = [...groups].map(([modelId, targets], index): ModelRoute => {
      const original = index === 0 ? editingRoute : null;
      const policy = selection.modelReasoning?.find(item => item.modelId === modelId);
      const capability = selection.modelCapabilities?.find(item => item.modelId === modelId);
      return { id: original?.id ?? crypto.randomUUID(), alias: original?.alias ?? modelId, enabled: original?.enabled ?? true,
        inboundProtocol: selection.inboundProtocol, outboundProtocol: selection.outboundProtocol, targets,
        failover: { ...original?.failover, ...selection.failover! },
        ...(policy && "min" in policy ? { reasoning: { min: policy.min, max: policy.max } } : {}),
        ...(capability?.capabilities ? { capabilities: structuredClone(capability.capabilities) } : !capability && original?.capabilities ? { capabilities: structuredClone(original.capabilities) } : {}),
      };
    });
    setRoutes(current => [...current.filter(route => route.id !== editingRoute?.id), ...additions]);
    setMessage(`已添加 ${additions.length} 条预览路由，刷新后不会保留。`);
    setFormOpen(false);
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
      {formOpen && <RouteEditor route={editingRoute} routes={routes} upstreams={data.upstreams} live={data.meta.live} onSave={saveRoutes} onClose={() => setFormOpen(false)} />}
      <section className="route-list-section" aria-labelledby="route-list-title">
      <div className="section-heading"><div className="section-title-row"><h2 id="route-list-title" className="section-title">路由配置</h2><span className="result-count">{routes.length} 条路由</span></div><FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时路由" : "浏览器预览路由"}</FixtureNotice></div>
      <ModelFamilyFilter ariaLabel="路由模型分类" value={routeFamily} families={routeFamilies} onChange={setRouteFamily} />
      {routeFamily !== "all" && <p className="route-filter-summary" role="status">当前显示 {visibleRoutes.length} 条路由，共 {routes.length} 条</p>}
      {visibleRoutes.length ? <div className="table-scroll" role="region" aria-label="模型路由列表" tabIndex={0}><table className={`routes-table${data.meta.live ? " has-actions" : ""}`}>
        <colgroup><col className="route-col-model" /><col className="route-col-inbound" /><col className="route-col-upstream" /><col className="route-col-outbound" /><col className="route-col-response" /><col className="route-col-state" />{data.meta.live && <col className="route-col-actions" />}</colgroup>
        <thead><tr><th aria-label="模型">模型 / 调用名</th><th aria-label="客户端协议 / 入站">入站协议</th><th>目标上游</th><th aria-label="上游协议 / 出站">出站协议</th><th>响应协议</th><th>状态</th>{data.meta.live && <th className="row-actions-heading">操作</th>}</tr></thead>
        <tbody>{visibleRoutes.map((route) => <tr key={route.id}>
          <td><strong className="route-model-name">{route.targets[0]?.upstreamModel ?? route.alias}</strong>{route.reasoning && <span className="cell-subtext">推理区间：{reasoningRangeLabel(route.reasoning)}</span>}{route.capabilities && <span className="cell-subtext">{route.capabilities.contextWindow === undefined ? "上下文未知" : `上下文 ${route.capabilities.contextWindow}`} · {route.capabilities.maxOutputTokens === undefined ? "最大输出未知" : `最大输出 ${route.capabilities.maxOutputTokens}`}</span>}{route.targets[0] && route.alias !== route.targets[0].upstreamModel && <span className="cell-subtext">调用名：{route.alias}</span>}</td>
          <td><ProtocolBadge protocol={route.inboundProtocol} /></td>
          <td><RouteTargets route={route} upstreams={data.upstreams} /></td>
          <td><ProtocolBadge protocol={route.outboundProtocol} /></td>
          <td><ProtocolBadge protocol={route.inboundProtocol} /></td>
          <td className="route-state-cell"><span className={`route-state ${data.meta.live && route.enabled ? "is-enabled" : ""}`}><span className="route-state-mark" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none">{route.enabled ? <path d="m3 6 2 2 4-4" /> : <path d="M3 6h6" />}</svg></span>{route.enabled ? "已启用" : "已停用"}</span>{!data.meta.live && <span className="cell-subtext route-preview-state">预览状态</span>}</td>{data.meta.live && <td className="row-actions-cell"><div className="row-actions" role="group" aria-label={`${route.alias} 操作`}>{route.enabled && <Button variant="accent" size="small" className="route-action-test" aria-label={`测试调用 ${route.alias}`} onClick={() => setTestingRoute(route)}><svg className="route-test-play-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.8c0-.6.7-.9 1.2-.6l6 3.8a.7.7 0 0 1 0 1.2l-6 3.8a.7.7 0 0 1-1.2-.6z" fill="currentColor" /></svg>测试调用</Button>}<Button variant="secondary" size="small" className="route-action-edit" onClick={() => openForm(route)}>编辑</Button><Button variant="secondary" size="small" className="route-action-toggle" onClick={() => void toggleRoute(route)}>{route.enabled ? "停用" : "启用"}</Button><Button variant="danger" size="small" className="route-action-delete" onClick={() => void deleteRoute(route.id)}>删除</Button></div></td>}
        </tr>)}</tbody>
      </table></div> : <EmptyResult>{routes.length ? "该分类暂无路由，可选择其他分类或添加路由。" : "还没有模型路由，添加路由以连接客户端与上游。"}</EmptyResult>}
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
