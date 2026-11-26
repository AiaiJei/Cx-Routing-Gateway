import { useRef, useState, type FormEvent } from "react";
import { Button } from "./Button";
import { CustomSelect } from "./CustomSelect";
import { ModelSelect } from "./ModelSelect";
import { Modal } from "./Modal";
import { capabilitiesDraft, readCapabilitiesDraft, RouteCapabilitiesFields, type CapabilitiesDraft } from "./RouteCapabilitiesFields";
import { REASONING_LEVELS, routeModelOptions, routeSelectionTargets, validReasoningRange } from "../domain/route-selection";
import type { ModelRoute, ModelRouteSelection, Protocol, ReasoningEffort, ReasoningRange, Upstream } from "../domain/types";

type Props = {
  route: ModelRoute | null;
  routes: ModelRoute[];
  upstreams: Upstream[];
  live: boolean;
  onSave: (selection: ModelRouteSelection) => Promise<void>;
  onClose: () => void;
};
type PolicyDrafts = Partial<Record<Protocol, Record<string, ReasoningRange | undefined>>>;
type ModelCapabilityDrafts = Partial<Record<Protocol, Record<string, CapabilitiesDraft>>>;

export function RouteEditor({ route, routes, upstreams, live, onSave, onClose }: Props) {
  const original = route?.targets ?? [];
  const [selectedUpstreams, setSelectedUpstreams] = useState(() => [...new Set(original.map(target => target.upstreamId))]);
  const [selectedModels, setSelectedModels] = useState(() => [...new Set(original.map(target => target.upstreamModel))]);
  const [modelsLoaded, setModelsLoaded] = useState(!!route);
  const [inboundProtocol, setInboundProtocol] = useState<Protocol>(route?.inboundProtocol ?? "Res");
  const [outboundProtocol, setOutboundProtocol] = useState<Protocol>(route?.outboundProtocol ?? "Chat");
  const [policyDrafts, setPolicyDrafts] = useState<PolicyDrafts>(() => ({
    [route?.inboundProtocol ?? "Res"]: Object.fromEntries(original.map(target => [target.upstreamModel, route?.reasoning ? { ...route.reasoning } : undefined])),
  }));
  const policies = policyDrafts[inboundProtocol] ?? {};
  const [capabilityDrafts, setCapabilityDrafts] = useState<ModelCapabilityDrafts>(() => ({
    [route?.inboundProtocol ?? "Res"]: Object.fromEntries(original.map(target => [target.upstreamModel, capabilitiesDraft(route?.capabilities)])),
  }));
  const capabilities = capabilityDrafts[inboundProtocol] ?? {};
  const [failureThreshold, setFailureThreshold] = useState(route?.failover?.failureThreshold ?? 3);
  const [statusClasses, setStatusClasses] = useState(route?.failover?.statusClasses ?? [4, 5]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const upstreamName = (id: string) => upstreams.find(upstream => upstream.id === id)?.name ?? `未发现上游 ${id}`;
  const missingUpstreams = selectedUpstreams.filter(id => !upstreams.some(upstream => upstream.id === id));
  const models = routeModelOptions(upstreams, selectedUpstreams, original);
  const targets = routeSelectionTargets(upstreams, selectedUpstreams, selectedModels, original);
  const ready = modelsLoaded && selectedModels.length > 0 && selectedModels.every(model => targets.some(target => target.modelId === model));

  function changeUpstreams(id: string, selected: boolean) {
    const next = selected ? [...selectedUpstreams, id] : selectedUpstreams.filter(value => value !== id);
    const available = routeModelOptions(upstreams, next, original);
    const remaining = selectedModels.filter(model => available.includes(model));
    const removed = selectedModels.filter(model => !available.includes(model));
    setSelectedUpstreams(next);
    setSelectedModels(remaining);
    setSelectionNotice(removed.length ? `已移除没有目标上游的模型：${removed.join("、")}。` : "");
  }

  function loadPolicyDrafts(current: PolicyDrafts, protocol: Protocol, nextModels: string[]): PolicyDrafts {
    const updated = { ...current[protocol] };
    for (const modelId of nextModels) {
      if (Object.hasOwn(updated, modelId)) continue;
      const editedModel = original.some(target => target.upstreamModel === modelId);
      const alias = editedModel && route ? route.alias : modelId;
      const existing = routes.find(item => item.enabled && item.inboundProtocol === protocol && item.alias === alias);
      const range = existing ? existing.reasoning : editedModel ? route?.reasoning : undefined;
      updated[modelId] = range ? { ...range } : undefined;
    }
    return { ...current, [protocol]: updated };
  }

  function changeModels(next: string[]) {
    setSelectedModels(next);
    setPolicyDrafts(current => loadPolicyDrafts(current, inboundProtocol, next));
    setCapabilityDrafts(current => loadCapabilityDrafts(current, inboundProtocol, next));
  }

  function loadCapabilityDrafts(current: ModelCapabilityDrafts, protocol: Protocol, nextModels: string[]): ModelCapabilityDrafts {
    const updated = { ...current[protocol] };
    for (const modelId of nextModels) {
      if (Object.hasOwn(updated, modelId)) continue;
      const editedModel = original.some(target => target.upstreamModel === modelId);
      const alias = editedModel && route ? route.alias : modelId;
      const existing = routes.find(item => item.enabled && item.inboundProtocol === protocol && item.alias === alias);
      updated[modelId] = capabilitiesDraft(existing ? existing.capabilities : editedModel ? route?.capabilities : undefined);
    }
    return { ...current, [protocol]: updated };
  }

  function changeInbound(protocol: Protocol) {
    setPolicyDrafts(current => loadPolicyDrafts(current, protocol, selectedModels));
    setCapabilityDrafts(current => loadCapabilityDrafts(current, protocol, selectedModels));
    setInboundProtocol(protocol);
    setError("");
  }

  function changePolicy(modelId: string, range: ReasoningRange | undefined) {
    setPolicyDrafts(current => ({ ...current, [inboundProtocol]: { ...current[inboundProtocol], [modelId]: range } }));
  }

  function moveUpstream(index: number, delta: number) {
    setSelectedUpstreams(current => {
      const next = [...current];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || savingRef.current) return;
    setError("");
    const invalid = selectedModels.find(model => policies[model] && !validReasoningRange(policies[model]!));
    if (invalid) { setError(`${invalid}：最低强度不能高于最高强度，请调整允许区间。`); return; }
    const modelCapabilities: NonNullable<ModelRouteSelection["modelCapabilities"]> = [];
    for (const modelId of selectedModels) {
      const result = readCapabilitiesDraft(capabilities[modelId] ?? capabilitiesDraft(), policies[modelId]);
      if (result.error) { setError(`${modelId}：${result.error}`); return; }
      modelCapabilities.push({ modelId, capabilities: result.capabilities });
    }
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 100 || !statusClasses.length) {
      setError("请设置 1 至 100 次失败，并选择至少一类错误状态码。"); return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        inboundProtocol, outboundProtocol, targets, editId: route?.id, replaceTargets: true,
        modelReasoning: selectedModels.map(modelId => policies[modelId] ? { modelId, ...policies[modelId]! } : { modelId, clear: true }),
        modelCapabilities,
        failover: { failureThreshold, statusClasses },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': Error:\s*/, "") : "保存路由失败，请重试。");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <Modal title={route ? "编辑路由" : "新增路由"} onClose={onClose} canClose={!saving}>
    <form className="modal-form route-editor" onSubmit={save} noValidate aria-busy={saving}>
      <p className="helper-text">同名模型只选一次，自动对应所选上游中提供该模型的服务。{route && `原调用名“${route.alias}”和${route.enabled ? "启用" : "停用"}状态会保留。`}</p>
      <fieldset className="route-editor-fields" disabled={saving}>
        <legend className="sr-only">路由配置内容</legend>
        <fieldset className="upstream-picker route-protocol-settings">
          <legend>协议设置</legend>
          <div className="route-protocol-grid">
            <label>客户端协议 / 入站<CustomSelect ariaLabel="客户端协议 / 入站" name="inbound" value={inboundProtocol} options={["Res", "Mes", "Chat"]} onChange={value => changeInbound(value as Protocol)} /></label>
            <label>上游协议 / 出站<CustomSelect ariaLabel="上游协议 / 出站" name="outbound" value={outboundProtocol} options={["Res", "Mes", "Chat"]} onChange={value => setOutboundProtocol(value as Protocol)} /></label>
          </div>
        </fieldset>
        <fieldset className="upstream-picker">
          <legend>选择上游服务</legend>
          <div className="route-upstream-options">
            {[...upstreams, ...missingUpstreams.map(id => ({ id, name: upstreamName(id), models: [] }))].map(upstream => <label className="route-upstream-option" key={upstream.id}>
              <input type="checkbox" aria-label={upstream.name} checked={selectedUpstreams.includes(upstream.id)} onChange={event => changeUpstreams(upstream.id, event.target.checked)} />
              <span>{upstream.name}<small>{upstream.models.length} 个{live ? "已发现" : "预览"}模型</small></span>
            </label>)}
          </div>
          {!modelsLoaded && <Button variant="secondary" size="small" disabled={!selectedUpstreams.length} onClick={() => setModelsLoaded(true)}>加载已选上游模型</Button>}
          {!upstreams.length && !missingUpstreams.length && <p className="helper-text">还没有上游服务，请先添加并测试上游。</p>}
        </fieldset>
        {selectionNotice && <p className="helper-text" role="status">{selectionNotice}</p>}
        {modelsLoaded && <div className="route-select-field"><span>统一模型</span><ModelSelect ariaLabel="统一模型" models={models} value={selectedModels} onChange={changeModels} /></div>}
        {selectedUpstreams.length > 1 && <fieldset className="upstream-picker">
          <legend>上游优先级</legend><p className="helper-text">顺序靠前的上游优先处理请求；只分配该上游提供的已选模型。</p>
          {selectedUpstreams.map((id, index) => <div className="priority-row" key={id}><span>{index + 1}. {upstreamName(id)}</span><div className="priority-actions">
            <Button variant="tertiary" size="small" aria-label={`提高 ${upstreamName(id)} 优先级`} disabled={index === 0} onClick={() => moveUpstream(index, -1)}>上移</Button>
            <Button variant="tertiary" size="small" aria-label={`降低 ${upstreamName(id)} 优先级`} disabled={index === selectedUpstreams.length - 1} onClick={() => moveUpstream(index, 1)}>下移</Button>
          </div></div>)}
        </fieldset>}
        {!!selectedModels.length && <section className="route-reasoning-settings" aria-labelledby="route-reasoning-title">
          <h3 id="route-reasoning-title" className="section-title">每个模型的推理区间</h3>
          <p className="helper-text">区间内按客户端选择转发，超出时调整到边界；客户端未传强度时，以 medium 调整到区间内。不限模式保留旧行为。区间按入站协议分别显示，本次手动修改在切换后保留。</p>
          <p className="helper-text">模型能力请按模型供应商官方资料填写，不根据模型名推测。输入能力默认文本和图片；清空配置会恢复此默认值，其他字段恢复未知或按上游处理。tokens 是模型计算文本用的单位；上下文窗口决定可管理的总量，最大输出限制单次回答。默认值和手动配置都不表示供应商能力已验证；Codex 当前配置是否引用这些能力，请到 Codex 页面检查模型目录状态。</p>
          {selectedModels.map(modelId => {
            const policy = policies[modelId];
            const modelTargets = targets.filter(target => target.modelId === modelId);
            const undiscovered = modelTargets.filter(target => !upstreams.find(upstream => upstream.id === target.upstreamId)?.models.includes(modelId));
            return <fieldset className="upstream-picker route-model-policy" key={modelId}>
              <legend>{modelId}</legend>
              <p className="route-model-targets">目标：{modelTargets.map(target => upstreamName(target.upstreamId)).join(" → ") || "没有可用目标"}</p>
              {!!undiscovered.length && <p className="route-model-warning">原有目标未在当前发现列表中：{undiscovered.map(target => upstreamName(target.upstreamId)).join("、")}。保存会保留这些原有对应关系；取消上游或模型选择可移除。</p>}
              <label className="route-range-toggle"><input type="checkbox" aria-label={`限制 ${modelId} 推理区间`} checked={!!policy} onChange={event => changePolicy(modelId, event.target.checked ? { min: "none", max: "max" } : undefined)} />允许区间<span className="helper-text">{policy ? `${policy.min} → ${policy.max}` : "不限（兼容旧路由）"}</span></label>
              <fieldset className="route-range-values" disabled={!policy}>
                <legend className="sr-only">{modelId} 允许强度</legend>
                <label>最低强度<CustomSelect ariaLabel={`${modelId} 最低强度`} value={policy?.min ?? "none"} options={[...REASONING_LEVELS]} onChange={value => changePolicy(modelId, { ...policy!, min: value as ReasoningEffort })} /></label>
                <label>最高强度<CustomSelect ariaLabel={`${modelId} 最高强度`} value={policy?.max ?? "max"} options={[...REASONING_LEVELS]} onChange={value => changePolicy(modelId, { ...policy!, max: value as ReasoningEffort })} /></label>
              </fieldset>
              <RouteCapabilitiesFields modelId={modelId} value={capabilities[modelId] ?? capabilitiesDraft()} onChange={draft => setCapabilityDrafts(current => ({ ...current, [inboundProtocol]: { ...current[inboundProtocol], [modelId]: draft } }))} />
            </fieldset>;
          })}
          <p className="helper-text">这些值是 Gateway 的实际转发范围，最高为 max。Ultra 是 Codex 界面别名，实际可能发送 max、xhigh 或 medium，以模型和客户端实际发出的值为准；Gateway 不将 max 升为 ultra。各模型支持值请参考 <a href="https://developers.openai.com/api/docs/guides/reasoning" target="_blank" rel="noreferrer">OpenAI 官方说明</a>和 <a href="https://platform.claude.com/docs/en/build-with-claude/effort" target="_blank" rel="noreferrer">Anthropic 官方说明</a>；能力未知时，不支持的值仍可能由上游报错。persistent 是模式，不列入强度排序。</p>
        </section>}
        <fieldset className="upstream-picker"><legend>故障切换</legend>
          <label className="failover-threshold">连续失败次数<input type="number" aria-label="连续失败次数" min="1" max="100" value={failureThreshold} onChange={event => setFailureThreshold(Number(event.target.value))} /></label>
          <div className="failover-statuses">{[4, 5].map(value => <label key={value}><input type="checkbox" checked={statusClasses.includes(value)} onChange={event => setStatusClasses(current => event.target.checked ? [...current, value].sort() : current.filter(item => item !== value))} />{value}xx</label>)}</div>
          <p className="helper-text">连接失败和超时也计入；切换后冷却 {route?.failover?.cooldownSeconds ?? 60} 秒，再尝试较高优先级。当前失败请求不会自动重试。</p>
        </fieldset>
      </fieldset>
      {error && <p role="alert" className="action-feedback">{error}</p>}
      {!ready && modelsLoaded && <p className="helper-text">请选择至少一个有目标上游的模型。</p>}
      <p className="helper-text">{live ? "保存后 Gateway 立即执行范围与能力约束；请回到 Codex 页面重新保存并启用网关，再完全退出并重启 Codex，重载模型能力目录。" : "当前为浏览器预览，保存仅影响本页，刷新后不会保留。"}</p>
      <div className="form-actions"><Button variant="tertiary" disabled={saving} onClick={onClose}>取消</Button><Button variant="primary" type="submit" disabled={!ready || saving}>{saving ? "保存中…" : "保存路由"}</Button></div>
    </form>
  </Modal>;
}
