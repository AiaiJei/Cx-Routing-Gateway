const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { fail } = require("./codex-errors.cjs");
const { REASONING_LEVELS, validReasoningRange } = require("./codex-reasoning-range.cjs");
const { validateCapabilities, supportedEfforts, LEVELS } = require("./codex-model-capabilities.cjs");
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
// Unmodified Apache-2.0 generic fallback from the validated installed CLI
// revision, shipped with its adjacent license/notice assets. No vendor-model
// instructions or policy/Guardian overrides are synthesized by Gateway.
const baseInstructions = fs.readFileSync(path.join(__dirname, "codex-fallback-prompt.txt"), "utf8");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const bounded = (value, max) =>
  typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

function catalogData(routeIds, defaultRouteId, aliases, prompt = baseInstructions, kind = "legacy", reasoningRanges, capabilities, defaultImages = false) {
  if (
    !Array.isArray(routeIds) ||
    routeIds.length < 1 ||
    routeIds.length > 100 ||
    !Array.isArray(aliases) ||
    aliases.length !== routeIds.length ||
    !routeIds.every((id) => bounded(id, 100)) ||
    !aliases.every((alias) => bounded(alias, 256)) ||
    new Set(routeIds).size !== routeIds.length ||
    new Set(aliases).size !== aliases.length ||
    !routeIds.includes(defaultRouteId)
  )
    throw fail("CODEX_INPUT_INVALID");
  if (reasoningRanges !== undefined && (kind !== "gateway" || !Array.isArray(reasoningRanges) ||
    reasoningRanges.length !== routeIds.length || reasoningRanges.some(value => value !== null && !validReasoningRange(value))))
    throw fail("CODEX_INPUT_INVALID");
  if (capabilities !== undefined && (!Array.isArray(capabilities) || capabilities.length !== routeIds.length)) throw fail("CODEX_INPUT_INVALID");
  const validatedCapabilities = capabilities?.map(value => value === null ? null : validateCapabilities(value));
  const levelsAt = index => supportedEfforts(validatedCapabilities?.[index], reasoningRanges?.[index]);
  const defaultAt = index => {
    const levels = levelsAt(index);
    return levels.reduce((best, level) => Math.abs(LEVELS.indexOf(level) - 3) < Math.abs(LEVELS.indexOf(best) - 3) ? level : best, levels[0]) ?? null;
  };
  return {
    models: aliases.map((alias, index) => ({
      slug: alias,
      display_name: alias,
      description: null,
      default_reasoning_level: kind === "gateway" ? defaultAt(index) : null,
      supported_reasoning_levels:
        kind === "gateway"
          ? levelsAt(index).map((effort) => ({ effort, description: effort }))
          : [],
      shell_type: "unified_exec",
      visibility: "list",
      supported_in_api: true,
      priority: routeIds[index] === defaultRouteId ? 0 : index + 1,
      base_instructions: prompt,
      availability_nux: null,
      upgrade: null,
      support_verbosity: false,
      default_verbosity: null,
      apply_patch_tool_type: null,
      truncation_policy: { mode: "bytes", limit: 10000 },
      experimental_supported_tools: [],
      input_modalities: validatedCapabilities?.[index]?.inputModalities || (defaultImages ? ["text", "image"] : ["text"]),
      ...(validatedCapabilities?.[index]?.contextWindow ? { context_window: validatedCapabilities[index].contextWindow, max_context_window: validatedCapabilities[index].contextWindow } : {}),
      supports_search_tool: false,
      supports_image_detail_original: false,
      supports_reasoning_summary_parameter: false,
      ...(kind === "gateway" ? { supports_reasoning_effort_updates: false } : {}),
    })),
    _cxrg: {
      version: defaultImages ? 5 : capabilities !== undefined ? 4 : kind === "gateway" ? (reasoningRanges === undefined ? 2 : 3) : 1,
      ...(kind === "gateway" ? { kind: "gateway" } : defaultImages ? { kind: "direct" } : {}),
      routeIds: [...routeIds],
      defaultRouteId,
      aliases: [...aliases],
      ...(validatedCapabilities === undefined ? {} : { capabilities: validatedCapabilities }),
      ...(reasoningRanges === undefined ? {} : { reasoningRanges: reasoningRanges.map(value => value === null ? null : { ...value }) }),
    },
  };
}
function createModelCatalog(store) {
  const directory = path.join(store.stateDir, "catalogs");
  function plan(routeIds, defaultRouteId, aliases, kind = "gateway", reasoningRanges, capabilities) {
    const ranges = kind === "gateway" ? reasoningRanges || routeIds.map(() => null) : undefined;
    const caps = capabilities || routeIds.map(() => null);
    const data = catalogData(routeIds, defaultRouteId, aliases, baseInstructions, kind, ranges, caps, true);
    const bytes = Buffer.from(JSON.stringify(data, null, 2) + "\n");
    if (bytes.length > MAX_CATALOG_BYTES) throw fail("CODEX_CONFIG_TOO_LARGE");
    const id = hash(bytes);
    return { data, bytes, id, path: path.join(directory, id + ".json") };
  }
  async function inspect(configuredPath) {
    if (configuredPath === undefined) return { status: "none" };
    if (typeof configuredPath !== "string" || !path.isAbsolute(configuredPath)) return { status: "external" };
    const resolved = path.resolve(configuredPath);
    const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    if (!same(path.dirname(resolved), directory)) return { status: "external" };
    const id = path.basename(resolved, ".json");
    if (!/^[a-f0-9]{64}$/.test(id) || path.basename(resolved) !== id + ".json") return { status: "invalid" };
    try {
      const bytes = await store.read(resolved, MAX_CATALOG_BYTES);
      if (bytes === null) return { status: "missing" };
      if (hash(bytes) !== id) return { status: "invalid" };
      const data = JSON.parse(bytes.toString("utf8"));
      const version = data?._cxrg?.version;
      const gateway = data?._cxrg?.kind === "gateway";
      if (![1, 2, 3, 4, 5].includes(version) || (version >= 2 && version <= 4 && !gateway) ||
        (version === 5 && !["gateway", "direct"].includes(data._cxrg.kind)) ||
        (gateway && version >= 3 && !Array.isArray(data._cxrg.reasoningRanges)) ||
        (version >= 4 && !Array.isArray(data._cxrg.capabilities))) return { status: "invalid" };
      // Validate stored schema and integrity, retaining older generic prompt
      // bytes when the bundled CLI fallback changes in a later app version.
      const prompt = data.models?.[0]?.base_instructions;
      if (typeof prompt !== "string" || !prompt || Buffer.byteLength(prompt) > 64 * 1024) return { status: "invalid" };
      const expected = catalogData(
        data._cxrg.routeIds,
        data._cxrg.defaultRouteId,
        data._cxrg.aliases,
        prompt,
        gateway ? "gateway" : "legacy",
        gateway && version >= 3 ? data._cxrg.reasoningRanges : undefined,
        version >= 4 ? data._cxrg.capabilities : undefined,
        version === 5,
      );
      if (JSON.stringify(data) !== JSON.stringify(expected)) return { status: "invalid" };
      return { status: "managed", data };
    } catch {
      return { status: "invalid" };
    }
  }
  async function recoverPublishedTemporary(prepared) {
    await store.directory(directory);
    const before = await store.fs.lstat(prepared.path).catch(() => null);
    // The only recoverable state has exactly our final name plus one temporary
    // alias. All other hard-link counts retain the ordinary read refusal.
    if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 2 || before.size > MAX_CATALOG_BYTES)
      return false;
    const sameFile = (info) =>
      info?.isFile() &&
      !info.isSymbolicLink() &&
      info.dev === before.dev &&
      info.ino === before.ino &&
      info.nlink === 2 &&
      info.size === before.size &&
      info.mtimeMs === before.mtimeMs;
    const handle = await store.fs.open(prepared.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      if (!sameFile(await handle.stat())) return false;
      const bytes = await handle.readFile();
      if (bytes.length > MAX_CATALOG_BYTES || hash(bytes) !== prepared.id || !bytes.equals(prepared.bytes))
        return false;
      const pattern = new RegExp(
        "^\\." + prepared.id + "\\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\.tmp$",
      );
      const aliases = [];
      let scanned = 0;
      const entries = await store.fs.opendir(directory);
      for await (const entry of entries) {
        if (++scanned > 4096) return false;
        if (!entry.isFile() || !pattern.test(entry.name)) continue;
        const candidate = path.join(directory, entry.name);
        if (sameFile(await store.fs.lstat(candidate))) aliases.push(candidate);
      }
      if (aliases.length !== 1) return false;
      await store.directory(directory);
      if (
        !sameFile(await handle.stat()) ||
        !sameFile(await store.fs.lstat(prepared.path)) ||
        !sameFile(await store.fs.lstat(aliases[0]))
      )
        return false;
      // Remove only the exact generated temporary alias whose identity and full
      // expected bytes were verified; never relax generic hard-link guards.
      await store.fs.unlink(aliases[0]);
      const after = await store.fs.lstat(prepared.path);
      return (
        after.isFile() &&
        !after.isSymbolicLink() &&
        after.dev === before.dev &&
        after.ino === before.ino &&
        after.nlink === 1
      );
    } finally {
      await handle.close();
    }
  }
  async function write(prepared) {
    await store.directory(directory, true);
    let existing = await inspect(prepared.path);
    if (existing.status === "invalid" && (await recoverPublishedTemporary(prepared)))
      existing = await inspect(prepared.path);
    if (existing.status === "managed") return;
    if (existing.status !== "missing") throw fail("CODEX_CATALOG_INVALID");
    const temporary = path.join(directory, "." + prepared.id + "." + crypto.randomUUID() + ".tmp");
    let handle,
      published = false;
    try {
      handle = await store.fs.open(temporary, "wx", 0o600);
      await handle.writeFile(prepared.bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await store.directory(directory);
      // Hard-link publication atomically creates an exclusive final name:
      // unlike rename(), it cannot overwrite a racing existing catalogue.
      try {
        await store.fs.link(temporary, prepared.path);
        published = true;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      await store.fs.unlink(temporary);
      if ((await inspect(prepared.path)).status !== "managed") throw fail("CODEX_CATALOG_INVALID");
    } catch (error) {
      // If unlinking our second link failed, discard only our own unpublished
      // catalogue name so an incomplete attempt remains retryable.
      if (published) {
        const info = await store.fs.lstat(prepared.path).catch(() => null);
        if (info?.nlink > 1) await store.fs.unlink(prepared.path).catch(() => {});
      }
      throw error;
    } finally {
      if (handle) await handle.close().catch(() => {});
      await store.fs.unlink(temporary).catch(() => {});
    }
  }
  function planDirect(models, defaultModel) {
    return plan(
      models.map((_, index) => "direct-model-" + index),
      "direct-model-" + models.indexOf(defaultModel),
      models,
      "legacy",
    );
  }
  return { plan, planDirect, inspect, write };
}
module.exports = { createModelCatalog, catalogData };
