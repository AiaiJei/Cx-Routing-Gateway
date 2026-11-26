import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const evidence = path.resolve('docs/tasks/evidence/overview-refactor-20261126/local-test-1.1.12');
const baseline = JSON.parse(await fs.readFile(path.join(evidence, 'preflight.json'), 'utf8'));
const folder = path.resolve(process.argv[2] || '');
assert.equal(folder, path.join(baseline.desktop, 'Cx-Routing Gateway 1.1.12 测试版'));
const executable = path.join(folder, 'Cx-Routing Gateway Portable 1.1.12.exe');
const launcher = path.join(folder, 'Launch-Test.ps1');
const profile = path.join(folder, 'Profile');
const temporary = path.resolve('.tmp/local-release-1.1.12-20261127');
assert.ok(temporary.startsWith(process.cwd() + path.sep));
const powerShell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const pause = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function reserve(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function until(check, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { lastError = error.message; }
    await pause(300);
  }
  throw new Error(`${label} timed out${lastError ? ': ' + lastError : ''}`);
}

const reservations = [];
let launched;
let socket;
const pending = new Map();
const exceptions = [];
let sequence = 0;
let result;
try {
  for (const port of [18418, 18419, 0]) reservations.push(await reserve(port));
  const debugPort = reservations[2].port;
  await Promise.all(reservations.map((reservation) => reservation.close()));
  reservations.length = 0;
  const command = spawnSync(powerShell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher, '-NoDialogs', '-DebugPort', String(debugPort)], {
    env: { ...process.env, TEMP: temporary, TMP: temporary }, windowsHide: true, encoding: 'utf8', timeout: 20000,
  });
  const launchLine = command.stdout?.split(/\r?\n/).find((line) => line.trim().startsWith('{'));
  if (launchLine) launched = JSON.parse(launchLine);
  assert.equal(command.status, 0, command.stderr || 'launcher failed');
  assert.ok(Number.isSafeInteger(launched?.processId));
  assert.equal(launched.profile, profile);
  assert.equal(baseline.existingProcesses.some((process) => process.ProcessId === launched.processId), false);

  const services = {};
  for (const [name, port] of [['local-control', 18419], ['gateway', 18418]]) {
    services[name] = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      return response.ok && body.status === 'ok' && body.service === name ? body : false;
    }, `${name} health`);
  }
  const page = await until(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
    return pages.find((target) => target.type === 'page' && target.url.startsWith('file:') && target.url.includes('/resources/app.asar/dist/index.html'));
  }, 'packaged renderer');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await until(() => evaluate('!!document.querySelector(".overview-model-ring svg") && !!window.desktopControls'), 'native overview');
  const workspace = await evaluate('window.desktopControls.getWorkspace().then(state => ({ gatewayPort: state.settings.gatewayPort, upstreams: state.upstreams.length, routes: state.routes.length, usage: state.usage.length, runtime: state.runtimeStatus.state }))');
  assert.equal(workspace.gatewayPort, 18418); assert.equal(workspace.runtime, 'running');
  assert.equal(workspace.upstreams, 0); assert.equal(workspace.routes, 0); assert.equal(workspace.usage, 0);
  const overview = await evaluate('({range:document.getElementById("overview-range").value,total:document.querySelector(".overview-model-ring svg").getAttribute("data-total"),live:!!document.querySelector(".fixture-notice.live")})');
  assert.deepEqual(overview, { range: 'today', total: '0', live: true });
  await evaluate('document.fonts.ready.then(() => true)');
  let capture = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(evidence, 'native-overview.png'), Buffer.from(capture.data, 'base64'));
  await evaluate('location.hash = "/settings"');
  await until(() => evaluate('document.body.innerText.includes("版本 1.1.12")'), 'native settings version');
  await evaluate('[...document.querySelectorAll("*")].find(element => element.children.length === 0 && element.textContent.trim() === "版本 1.1.12")?.scrollIntoView({block:"center"})');
  capture = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(evidence, 'native-settings.png'), Buffer.from(capture.data, 'base64'));
  assert.deepEqual(exceptions, []);
  const profileConfig = JSON.parse(await fs.readFile(path.join(profile, 'runtime/config.json'), 'utf8'));
  assert.equal(profileConfig.settings.gatewayPort, 18418);
  result = { ok: true, version: '1.1.12', executable, profile, services, workspace, overview, nativeSettingsVersion: true, exceptions, providerCalls: 'NOT_RUN', source: 'actual Desktop Portable via copied isolation launcher; no browser fixture bridge' };
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  socket?.close();
  await Promise.all(reservations.map((reservation) => reservation.close()));
  if (Number.isSafeInteger(launched?.processId)) {
    const owned = spawnSync(powerShell, ['-NoProfile', '-Command', '$owned = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $env:CXRG_TEST_PID); if ($owned -and $owned.ExecutablePath -eq $env:CXRG_TEST_EXPECTED_EXE) { exit 0 }; exit 1'], {
      env: { ...process.env, CXRG_TEST_PID: String(launched.processId), CXRG_TEST_EXPECTED_EXE: executable }, windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
    if (owned.status === 0) spawnSync('taskkill.exe', ['/PID', String(launched.processId), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
}
await fs.writeFile(path.join(evidence, 'native-desktop-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
