import crypto from 'node:crypto';
import { validateReasoningRange, updateRouteReasoning } from '../../../packages/shared/src/reasoning-policy.mjs';
import { updateRouteCapabilities, modelCapabilitiesEntries } from '../../../packages/shared/src/model-capabilities.cjs';

const badRequest = code => Object.assign(new Error(code), { statusCode: 400 });

function modelPolicies(entries, modelIds) {
  const policies = new Map();
  if (entries === undefined) return policies;
  if (!Array.isArray(entries) || entries.length > 512) throw badRequest('invalid_model_reasoning');
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.modelId !== 'string' || !modelIds.has(entry.modelId) || policies.has(entry.modelId)) throw badRequest('invalid_model_reasoning');
    if (entry.clear === true) {
      if (Object.keys(entry).some(key => key !== 'modelId' && key !== 'clear')) throw badRequest('invalid_model_reasoning');
      policies.set(entry.modelId, null);
    } else {
      if (Object.keys(entry).some(key => !['modelId', 'min', 'max'].includes(key))) throw badRequest('invalid_model_reasoning');
      policies.set(entry.modelId, validateReasoningRange({ min: entry.min, max: entry.max }));
    }
  }
  return policies;
}

/** Build a complete, atomic route update; the caller owns the store transaction. */
export function saveRouteBatch(config, { inboundProtocol, outboundProtocol, targets, editId, failover, modelReasoning, modelCapabilities, replaceTargets }) {
  if (replaceTargets !== undefined && typeof replaceTargets !== 'boolean') throw badRequest('invalid_replace_targets');
  const original = editId && config.routes.find(route => route.id === editId);
  if (editId && !original) throw Object.assign(new Error('route_not_found'), { statusCode: 404 });
  const groups = new Map();
  for (const target of targets) {
    if (!target || typeof target.modelId !== 'string' || !target.modelId.trim() || !config.upstreams.some(item => item.id === target.upstreamId)) throw badRequest('invalid_target');
    const list = groups.get(target.modelId) ?? [];
    if (!list.some(item => item.upstreamId === target.upstreamId)) list.push({ upstreamId: target.upstreamId, modelId: target.modelId });
    groups.set(target.modelId, list);
  }
  const policies = modelPolicies(modelReasoning, groups);
  const capabilities = modelCapabilitiesEntries(modelCapabilities, groups);
  const retained = config.routes.filter(route => route.id !== editId);
  const originalTargets = original?.targets?.length ? original.targets : original ? [{ upstreamId: original.upstreamId, modelId: original.modelId }] : [];
  const preserveModel = originalTargets.find(target => groups.has(target.modelId))?.modelId ?? (original ? targets[0].modelId : undefined);
  const saved = [];
  for (const [modelId, selection] of groups) {
    const previous = original && modelId === preserveModel ? original : undefined;
    const alias = previous?.alias ?? modelId;
    const existingIndex = retained.findIndex(route => route.enabled && route.inboundProtocol === inboundProtocol && route.alias === alias);
    const existing = existingIndex >= 0 ? retained[existingIndex] : undefined;
    if (existing && (previous || existing.outboundProtocol !== outboundProtocol || existing.modelId !== modelId)) throw Object.assign(new Error('route_conflict'), { statusCode: 409 });
    const base = previous ?? existing;
    const priorTargets = existing && replaceTargets !== true ? (existing.targets?.length ? existing.targets : [{ upstreamId: existing.upstreamId, modelId: existing.modelId }]) : [];
    const merged = [...selection];
    for (const item of priorTargets) if (!merged.some(target => target.upstreamId === item.upstreamId && target.modelId === item.modelId)) merged.push(item);
    const policy = failover ? { failureThreshold: failover.failureThreshold, statusClasses: failover.statusClasses, cooldownSeconds: 60 } : base?.failover ?? { failureThreshold: 3, statusClasses: [4, 5], cooldownSeconds: 60 };
    const route = { ...base, id: base?.id ?? `route_${crypto.randomUUID()}`, alias, enabled: base?.enabled ?? true, inboundProtocol, outboundProtocol, upstreamId: merged[0].upstreamId, modelId: merged[0].modelId, targets: merged, failover: policy, allowLossy: base?.allowLossy ?? false };
    if (route.enabled && saved.some(item => item.enabled && item.inboundProtocol === route.inboundProtocol && item.alias === route.alias)) throw Object.assign(new Error('route_conflict'), { statusCode: 409 });
    if (existing) retained.splice(existingIndex, 1);
    const withReasoning = policies.has(modelId) ? updateRouteReasoning(route, { reasoning: policies.get(modelId) }) : route;
    saved.push(updateRouteCapabilities(withReasoning, capabilities.has(modelId) ? { capabilities: capabilities.get(modelId) } : {}));
  }
  return { config: { ...config, routes: [...retained, ...saved] }, routes: saved };
}
