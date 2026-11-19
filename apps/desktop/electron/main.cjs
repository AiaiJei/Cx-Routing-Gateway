const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { startRuntime } = require("./runtime-supervisor.cjs");
const { isTrustedDocumentUrl } = require("./security.cjs");

const devServerUrl = process.env.CXRG_DEV_SERVER_URL;
const controlPort = Number(process.env.CXRG_CONTROL_PORT || 4319);
let runtime;
let startupState = "starting";
let quitting = false;

function masterKeyPath() {
  return path.join(app.getPath("userData"), "runtime-master.key");
}

function getMasterKey() {
  if (process.env.CXRG_MASTER_KEY) return process.env.CXRG_MASTER_KEY;
  const target = masterKeyPath();
  try {
    const stored = fs.readFileSync(target, "utf8").trim();
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(stored, "base64"));
    return stored;
  } catch {}
  const key = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stored = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString("base64") : key;
  fs.writeFileSync(target, `${stored}\n`, { mode: 0o600 });
  return key;
}

function trustedSender(event) {
  const url = event.senderFrame?.url || "";
  return isTrustedDocumentUrl({ url, appIndexPath: path.join(__dirname, "..", "dist", "index.html"), devServerUrl });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: "#f9fbfc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedDocumentUrl({ url, appIndexPath: path.join(__dirname, "..", "dist", "index.html"), devServerUrl })) event.preventDefault();
  });

  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  window.once("ready-to-show", () => window.show());
}

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:toggle-maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
  return window.isMaximized();
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("runtime:get-workspace", async (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted runtime request");
  const headers = { authorization: `Bearer ${runtime?.controlToken || ""}` };
  const [response, metrics] = await Promise.all([fetch(`http://127.0.0.1:${controlPort}/v1/control/state`, { headers }), fetch(`http://127.0.0.1:${controlPort}/v1/control/metrics`, { headers })]);
  if (!response.ok) throw new Error(`Control API returned ${response.status}`);
  return { ...(await response.json()), metrics: metrics.ok ? await metrics.json() : undefined, runtimeStatus: runtime?.getStatus?.() || { state: "stopped" } };
});

ipcMain.handle("runtime:get-status", async (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted runtime request");
  return runtime?.getStatus?.() || { state: startupState };
});

ipcMain.handle("runtime:test-upstream", async (event, upstreamId) => {
  if (!trustedSender(event) || typeof upstreamId !== "string" || upstreamId.length > 100) throw new Error("Untrusted runtime request");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/upstreams/${encodeURIComponent(upstreamId)}/test`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: "{}" });
  if (!response.ok) throw new Error(`Connectivity test returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:create-client-key", async (event, name, scope) => {
  if (!trustedSender(event) || typeof name !== "string" || !name.trim()) throw new Error("Invalid key name");
  const normalizedScope = Array.isArray(scope) ? scope.filter((item) => typeof item === "string" && item.trim()).slice(0, 100) : [];
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/client-keys`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify({ name: name.trim().slice(0, 80), scope: normalizedScope }) });
  if (!response.ok) throw new Error(`Client key creation returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:rotate-client-key", async (event, id) => {
  if (!trustedSender(event) || typeof id !== "string") throw new Error("Invalid key id");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/client-keys/${encodeURIComponent(id)}/rotate`, { method: "POST", headers: { authorization: `Bearer ${runtime?.controlToken || ""}` } });
  if (!response.ok) throw new Error(`Client key rotation returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:revoke-client-key", async (event, id) => {
  if (!trustedSender(event) || typeof id !== "string") throw new Error("Invalid key id");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/client-keys/${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${runtime?.controlToken || ""}` } });
  if (!response.ok) throw new Error(`Client key revoke returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:create-upstream", async (event, input) => {
  if (!trustedSender(event) || !input || typeof input.name !== "string" || typeof input.baseUrl !== "string") throw new Error("Invalid upstream");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/upstreams`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify({ name: input.name.trim().slice(0, 80), baseUrl: input.baseUrl.trim(), apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined, allowPrivateNetwork: input.allowPrivateNetwork === true }) });
  if (!response.ok) throw new Error(`Upstream creation returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:delete-upstream", async (event, id) => {
  if (!trustedSender(event) || typeof id !== "string") throw new Error("Invalid upstream id");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/upstreams/${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${runtime?.controlToken || ""}` } });
  if (!response.ok) throw new Error(`Upstream deletion returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:save-model-routes", async (event, selection) => {
  if (!trustedSender(event) || !Array.isArray(selection?.targets)) throw new Error("无效的路由选择");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/routes/batch`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify(selection),
  });
  if (response.status === 409) throw new Error("同名模型已使用不同的出站协议，请先编辑现有路由。");
  if (!response.ok) throw new Error(`保存路由失败（${response.status}）`);
  return response.json();
});

ipcMain.handle("runtime:create-route", async (event, input) => {
  if (!trustedSender(event) || !input || typeof input.alias !== "string") throw new Error("Invalid route");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/routes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Route creation returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:delete-route", async (event, id) => {
  if (!trustedSender(event) || typeof id !== "string") throw new Error("Invalid route id");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/routes/${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${runtime?.controlToken || ""}` } });
  if (!response.ok) throw new Error(`Route deletion returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:update-route", async (event, id, input) => {
  if (!trustedSender(event) || typeof id !== "string" || !input || typeof input !== "object") throw new Error("Invalid route update");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/routes/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Route update returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:update-settings", async (event, input) => {
  if (!trustedSender(event) || !input || !Number.isInteger(input.usageRetentionCount)) throw new Error("Invalid settings");
  const response = await fetch(`http://127.0.0.1:${controlPort}/v1/control/settings`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${runtime?.controlToken || ""}` }, body: JSON.stringify({ usageRetentionCount: input.usageRetentionCount }) });
  if (!response.ok) throw new Error(`Settings update returned ${response.status}`);
  return response.json();
});

ipcMain.handle("runtime:check-update", async (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted runtime request");
  const manifestUrl = process.env.CXRG_UPDATE_MANIFEST_URL;
  if (!manifestUrl) return { configured: false, available: false };
  const scriptPath = process.resourcesPath && !process.defaultApp ? path.join(process.resourcesPath, "runtime", "scripts", "check-update.mjs") : path.join(__dirname, "..", "..", "..", "scripts", "check-update.mjs");
  const { checkUpdate } = await import(scriptPath);
  return { configured: true, ...(await checkUpdate({ manifestUrl, currentVersion: app.getVersion() })) };
});

ipcMain.handle("runtime:install-update", async (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted runtime request");
  const manifestUrl = process.env.CXRG_UPDATE_MANIFEST_URL;
  if (!manifestUrl) return { configured: false, installed: false };
  const scriptPath = process.resourcesPath && !process.defaultApp ? path.join(process.resourcesPath, "runtime", "scripts", "check-update.mjs") : path.join(__dirname, "..", "..", "..", "scripts", "check-update.mjs");
  const { installUpdate } = await import(scriptPath);
  const result = await installUpdate({ manifestUrl, currentVersion: app.getVersion(), downloadDir: path.join(app.getPath("temp"), "cxrg-updates") });
  const installer = spawn(result.path, [], { detached: true, stdio: "ignore", windowsHide: false });
  installer.unref();
  quitting = true;
  await runtime?.stop();
  app.exit(0);
  return { configured: true, installed: true, version: result.version };
});

const versionOnly = process.argv.includes("--version");
const lock = versionOnly ? true : app.requestSingleInstanceLock();
if (versionOnly) {
  app.whenReady().then(() => { console.log(app.getVersion()); app.exit(0); });
} else if (!lock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      runtime = await startRuntime({ dataDir: path.join(app.getPath("userData"), "runtime"), masterKey: getMasterKey() });
      startupState = "running";
    } catch (error) {
      startupState = "failed";
      console.error("Gateway runtime failed to start", error);
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", async (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    try { await runtime?.stop(); } finally { app.exit(0); }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
