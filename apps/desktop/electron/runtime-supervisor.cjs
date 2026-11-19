const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

function healthUrl(port, service) { return `http://127.0.0.1:${port}/health`; }

async function waitForHealth(port, service) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(healthUrl(port, service)); const body = await response.json(); if (response.ok && body.service === service) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${service} did not become ready`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (typeof child.stdin?.end === 'function') child.stdin.end();
  else { child.kill(); return; }
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

function listenServer(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function closeServer(server, graceMs = 3000) {
  return new Promise((resolve) => {
    if (!server || !server.listening) return resolve();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    }, graceMs);
    server.close(finish);
  });
}

async function startRuntime({ dataDir, masterKey, controlPort = 4319, gatewayPort = 4318 } = {}) {
  if (!dataDir || !masterKey) throw new Error('Runtime dataDir and masterKey are required');
  const root = process.resourcesPath && !process.defaultApp ? path.join(process.resourcesPath, 'runtime') : path.resolve(__dirname, '..', '..', '..');
  const controlToken = crypto.randomBytes(32).toString('base64url');
  const env = { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), CXRG_DATA_DIR: dataDir, CXRG_MASTER_KEY: masterKey, CXRG_CONTROL_TOKEN: controlToken, CXRG_CONTROL_PORT: String(controlPort), CXRG_GATEWAY_PORT: String(gatewayPort) };
  const entries = [path.join(root, 'services', 'local-control', 'src', 'server.mjs'), path.join(root, 'services', 'gateway', 'src', 'server.mjs')];
  const ports = [controlPort, gatewayPort];
  if (process.versions.electron) {
    const [{ ConfigStore }, { SecretVault }, { createControlServer }, { createGatewayServer }] = await Promise.all([
      import(pathToFileURL(path.join(root, 'packages', 'shared', 'src', 'config-store.mjs')).href),
      import(pathToFileURL(path.join(root, 'packages', 'shared', 'src', 'secret-vault.mjs')).href),
      import(pathToFileURL(entries[0]).href),
      import(pathToFileURL(entries[1]).href),
    ]);
    const store = new ConfigStore(path.join(dataDir, 'config.json'));
    const vault = new SecretVault(path.join(dataDir, 'secrets.json'), masterKey);
    const controlServer = createControlServer({ store, vault, controlToken });
    const gatewayServer = createGatewayServer({ store, vault });
    let state = 'starting';
    let failure;
    const markFailed = (service, error) => { if (state !== 'stopping') { state = 'failed'; failure = { service, error: error?.message || String(error) }; } };
    controlServer.once('error', (error) => markFailed('local-control', error));
    gatewayServer.once('error', (error) => markFailed('gateway', error));
    try {
      await listenServer(controlServer, controlPort);
      await listenServer(gatewayServer, gatewayPort);
    } catch (error) {
      await Promise.all([closeServer(gatewayServer), closeServer(controlServer)]);
      throw error;
    }
    state = 'running';
    return { children: [], controlToken, testRoute: (routeId, prompt) => gatewayServer.testRoute(routeId, prompt), getStatus: () => ({ state, failure }), stop: async () => { state = 'stopping'; await Promise.all([closeServer(gatewayServer), closeServer(controlServer)]); state = 'stopped'; } };
  }
  const children = entries.map((entry, index) => {
    const child = spawn(process.execPath, [entry], { env, stdio: ['pipe', 'ignore', 'pipe'] });
    child.stderr.on('data', (chunk) => { console.error(`[${index === 0 ? 'local-control' : 'gateway'}] ${String(chunk).trim()}`); });
    return child;
  });
  let state = 'starting';
  let failure;
  children.forEach((child, index) => child.once('exit', (code, signal) => { if (state !== 'stopping') { state = 'failed'; failure = { service: index === 0 ? 'local-control' : 'gateway', code, signal }; } }));
  try {
    await Promise.all(ports.map((port, index) => waitForHealth(port, index === 0 ? 'local-control' : 'gateway')));
  } catch (error) {
    await Promise.all(children.map(stopChild));
    throw error;
  }
  state = 'running';
  return { children, controlToken, getStatus: () => ({ state, failure }), stop: async () => { state = 'stopping'; await stopChild(children[1]); await stopChild(children[0]); state = 'stopped'; } };
}

module.exports = { closeServer, startRuntime };
