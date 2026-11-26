const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { fail, sanitize } = require("./codex-errors.cjs");
const { validRevision } = require("./codex-config-store.cjs");

const PROBE_TIMEOUT_MS = 5_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_PATH_BYTES = 32 * 1024;
const MAX_PATH_DIRECTORIES = 64;
const cleanPath = value => typeof value === "string" && value.length > 0 && value.length <= MAX_PATH_BYTES && !/[\u0000-\u001f\u007f]/.test(value) && path.isAbsolute(value) && !/^[/\\]{2}/.test(value);
const executablePath = value => cleanPath(value) && path.basename(value).toLowerCase() === "codex.exe";

// Search only the known installation and absolute PATH directories. In
// particular, do not execute a shell, .cmd wrapper, relative path or PATHEXT.
async function discoverCodexExecutable({ env = process.env } = {}) {
  const candidates = [];
  const localAppData = env.LOCALAPPDATA || env.LocalAppData;
  if (cleanPath(localAppData)) candidates.push(path.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  const searchPath = env.PATH || env.Path;
  if (typeof searchPath === "string" && Buffer.byteLength(searchPath) <= MAX_PATH_BYTES) {
    for (let directory of searchPath.split(path.delimiter).slice(0, MAX_PATH_DIRECTORIES)) {
      if (directory.startsWith('"') && directory.endsWith('"')) directory = directory.slice(1, -1);
      if (cleanPath(directory)) candidates.push(path.join(directory, "codex.exe"));
    }
  }
  for (const candidate of new Set(candidates)) {
    try {
      const info = await fs.lstat(candidate);
      if (info.isFile() && !info.isSymbolicLink()) return candidate;
    } catch { /* A missing/unreadable candidate is unavailable, never an error string. */ }
  }
  return undefined;
}

function parseVersion(result) {
  if (!result.ok || result.code !== 0) return undefined;
  const versions = result.output.split(/\r?\n/).map(line => line.match(/^codex-cli (\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-+][a-zA-Z0-9][a-zA-Z0-9.-]{0,63})?)$/)?.[1]).filter(Boolean);
  return versions.length === 1 ? versions[0] : undefined;
}
function parseAuth(result) {
  if (!result.ok) return "unknown";
  if (result.code === 0 && /^Logged in using ChatGPT\s*$/m.test(result.output)) return "chatgpt";
  if (result.code === 0 && /^Logged in using an API key(?:\s*- [^\r\n]*)?\s*$/m.test(result.output)) return "api";
  if ((result.code === 0 || result.code === 1) && /^Not logged in\s*$/m.test(result.output)) return "signed_out";
  return "unknown";
}
function terminate(child) {
  try { if (!child.kill("SIGTERM")) child.kill("SIGKILL"); } catch { /* Never surface native process details. */ }
}

function createCodexClientManager({ codexHome, resolveExecutable = discoverCodexExecutable, spawnImpl = spawn, getConfigStatus } = {}) {
  if (!cleanPath(codexHome) || typeof resolveExecutable !== "function" || typeof spawnImpl !== "function" || typeof getConfigStatus !== "function") throw fail("CODEX_INPUT_INVALID");
  const home = path.resolve(codexHome);
  let disposed = false;
  let login = "idle";
  let lastStatus = { available: false, auth: "unknown" };
  let statusPromise;
  let loginOperation;
  let statusGeneration = 0;
  const probes = new Set();
  const snapshot = () => ({ ...lastStatus, login });
  function assertActive() { if (disposed) throw fail("CODEX_CLIENT_DISPOSED"); }
  async function executable() {
    try { const candidate = await resolveExecutable(); return executablePath(candidate) ? candidate : undefined; }
    catch { return undefined; }
  }
  function options(file, stdio) {
    // Windows treats environment names case-insensitively, but Node receives
    // a JS object. Remove inherited variants before setting the fixed home.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "codex_home"));
    env.CODEX_HOME = home;
    return { cwd: path.dirname(file), shell: false, windowsHide: true, stdio, env };
  }
  function probe(file, args) {
    return new Promise(resolve => {
      let child, timer, settled = false, size = 0;
      let chunks = [];
      const finish = (ok, code, stop = false, spawnFailed = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        probes.delete(cancel);
        if (stop && child) terminate(child);
        const output = ok ? Buffer.concat(chunks).toString("utf8") : "";
        chunks = [];
        resolve({ ok, code, output, spawnFailed });
      };
      const cancel = () => finish(false, undefined, true);
      probes.add(cancel);
      try {
        child = spawnImpl(file, args, options(file, ["ignore", "pipe", "pipe"]));
        const collect = chunk => {
          if (settled) return;
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_OUTPUT_BYTES) cancel();
          else chunks.push(bytes);
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        child.stdout.on("error", cancel);
        child.stderr.on("error", cancel);
        child.once("error", () => finish(false, undefined, false, true));
        child.once("close", code => finish(true, code));
        timer = setTimeout(cancel, PROBE_TIMEOUT_MS);
        timer.unref?.();
      } catch { finish(false, undefined, true, true); }
    });
  }
  async function readStatus() {
    const generation = statusGeneration;
    const file = await executable();
    if (disposed) return { available: false, auth: "unknown", login };
    if (!file) {
      if (generation === statusGeneration) lastStatus = { available: false, auth: "unknown" };
    }
    else {
      const [versionResult, authResult] = await Promise.all([probe(file, ["--version"]), probe(file, ["login", "status"])]);
      const version = parseVersion(versionResult);
      if (disposed) lastStatus = { available: false, auth: "unknown" };
      else if (generation === statusGeneration) lastStatus = { available: !(versionResult.spawnFailed && authResult.spawnFailed), ...(version ? { version } : {}), auth: parseAuth(authResult) };
    }
    return snapshot();
  }
  async function checkSaved(expectedRevision) {
    const saved = await getConfigStatus();
    if (saved?.revision !== expectedRevision) throw fail("CODEX_CONFIG_CHANGED");
    if (saved.mode !== "direct" || saved.direct?.kind !== "official") throw fail("CODEX_LOGIN_MODE_REQUIRED");
  }
  function finishLogin(operation, state, stop = false) {
    if (operation.done) return;
    operation.done = true;
    clearTimeout(operation.timer);
    if (loginOperation === operation) {
      // Retain the reservation while cancellation is waiting for close. A
      // retry must never create a second login process beside the old one.
      if (!stop || !operation.child) loginOperation = undefined;
      login = state;
    }
    if (stop && operation.child) {
      terminate(operation.child);
      operation.killTimer = setTimeout(() => {
        try { operation.child.kill("SIGKILL"); } catch { /* Own child only. */ }
      }, 1_000);
      operation.killTimer.unref?.();
    }
    // A spawn error/timeout before Node confirms process creation must reject
    // the initial request rather than claiming that a browser was opened.
    if (!operation.spawned && state === "failed") operation.rejectStart?.(fail("CODEX_LOGIN_FAILED"));
    else operation.resolveStart?.();
  }
  function stopLogin() {
    if (!loginOperation) return;
    loginOperation.cancelled = true;
    finishLogin(loginOperation, "idle", true);
    statusGeneration++;
  }
  return {
    getLoginState: () => login,
    async getStatus() {
      assertActive();
      if (login === "pending") return snapshot();
      if (!statusPromise) {
        statusPromise = readStatus().finally(() => { statusPromise = undefined; });
      }
      return statusPromise;
    },
    async startLogin(input) {
      assertActive();
      if (!input || typeof input !== "object" || Array.isArray(input) || !validRevision(input.expectedRevision) || Object.keys(input).some(key => key !== "expectedRevision")) throw fail("CODEX_INPUT_INVALID");
      if (loginOperation) throw fail("CODEX_LOGIN_PENDING");
      const operation = { cancelled: false, done: false, spawned: false };
      loginOperation = operation;
      const aborted = () => disposed || operation.cancelled || loginOperation !== operation;
      try {
        await checkSaved(input.expectedRevision);
        if (aborted()) return snapshot();
        const file = await executable();
        if (aborted()) return snapshot();
        if (!file) { lastStatus = { available: false, auth: "unknown" }; throw fail("CODEX_CLI_NOT_FOUND"); }
        // Discovery can wait on the filesystem. Re-read the saved mode and
        // revision at the actual action boundary, never trust an old preview.
        await checkSaved(input.expectedRevision);
        if (aborted()) return snapshot();
        statusGeneration++;
        lastStatus = { ...lastStatus, available: true, auth: "unknown" };
        login = "pending";
        await new Promise((resolve, reject) => {
          operation.resolveStart = resolve;
          operation.rejectStart = reject;
          operation.timer = setTimeout(() => finishLogin(operation, "failed", true), LOGIN_TIMEOUT_MS);
          operation.timer.unref?.();
          try {
            // Official Codex owns browser launch, OAuth and credential writes.
            // Ignore all output: URLs/codes/tokens must not enter this app.
            operation.child = spawnImpl(file, ["login"], options(file, ["ignore", "ignore", "ignore"]));
            operation.child.once("spawn", () => {
              if (operation.done) return;
              operation.spawned = true;
              resolve();
            });
            operation.child.once("error", () => finishLogin(operation, "failed"));
            operation.child.once("close", code => {
              clearTimeout(operation.killTimer);
              if (operation.done) {
                if (loginOperation === operation) loginOperation = undefined;
                return;
              }
              finishLogin(operation, code === 0 ? "succeeded" : "failed");
            });
          } catch { finishLogin(operation, "failed", true); }
        });
        return snapshot();
      } catch (error) {
        if (loginOperation === operation && !operation.child) loginOperation = undefined;
        if (disposed) throw fail("CODEX_CLIENT_DISPOSED");
        if (operation.cancelled) return snapshot();
        throw sanitize(error, "CODEX_LOGIN_FAILED");
      }
    },
    async cancelLogin() {
      assertActive();
      stopLogin();
      return snapshot();
    },
    dispose() {
      disposed = true;
      stopLogin();
      for (const cancel of [...probes]) cancel();
      lastStatus = { available: false, auth: "unknown" };
    },
  };
}
module.exports = { createCodexClientManager, discoverCodexExecutable };
