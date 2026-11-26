/** Report disk configuration only; a running Codex can retain its startup catalog. */
async function catalogSyncStatus({ catalog, mode, config, catalogs, resolveSelection, preserveDirectCatalog = false }) {
  if (['missing', 'invalid'].includes(catalog.status)) return { state: 'unavailable', source: mode === 'gateway' ? 'gateway' : 'direct', models: [], catalogPath: config.model_catalog_json };
  if (catalog.status !== 'managed') return { state: 'not-applied', source: 'none', models: [] };
  const metadata = catalog.data._cxrg;
  const profile = typeof config.profile === 'string' ? config.profiles?.[config.profile] : undefined;
  if ((profile?.model_catalog_json !== undefined && profile.model_catalog_json !== config.model_catalog_json) ||
    (profile?.model_provider !== undefined && profile.model_provider !== config.model_provider) ||
    (typeof (profile?.model ?? config.model) === 'string' && !metadata.aliases.includes(profile?.model ?? config.model))) {
    return { state: 'not-applied', source: 'none', models: [] };
  }
  const source = mode === 'gateway' ? 'gateway' : 'direct';
  const facts = {
    source,
    catalogPath: config.model_catalog_json,
    models: catalog.data.models.map(model => ({ model: model.slug, inputModalities: [...model.input_modalities] })),
  };
  if ((metadata.kind === 'gateway' && mode !== 'gateway') || (metadata.kind === 'direct' && mode !== 'direct')) return { ...facts, state: 'not-applied' };
  if (source === 'direct' && preserveDirectCatalog) return { ...facts, state: 'current' };
  try {
    let expected;
    if (source === 'gateway') {
      const selection = { mode: 'gateway', routeIds: metadata.routeIds, defaultRouteId: metadata.defaultRouteId };
      const resolved = await resolveSelection(selection);
      if (resolved.baseUrl !== config.model_providers?.cx_routing_gateway?.base_url) return { ...facts, state: 'stale' };
      expected = catalogs.plan(selection.routeIds, selection.defaultRouteId, resolved.routes.map(route => route.model), 'gateway', resolved.routes.map(route => route.reasoning || null), resolved.routes.map(route => route.capabilities || null));
    } else {
      const defaultIndex = metadata.routeIds.indexOf(metadata.defaultRouteId);
      expected = catalogs.planDirect(metadata.aliases, metadata.aliases[defaultIndex]);
    }
    return { ...facts, state: expected.path === config.model_catalog_json ? 'current' : 'stale' };
  } catch {
    return { ...facts, state: 'unavailable' };
  }
}
module.exports = { catalogSyncStatus };
