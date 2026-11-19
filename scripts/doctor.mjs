import fs from 'node:fs/promises';
import path from 'node:path';

const checks = [];
async function check(name, action) {
  try { const detail = await action(); checks.push({ name, ok: true, detail }); } catch (error) { checks.push({ name, ok: false, error: error.message }); }
}

await check('control-health', async () => (await (await fetch(process.env.CXRG_CONTROL_URL || 'http://127.0.0.1:4319/health')).json()).service);
await check('gateway-health', async () => (await (await fetch(process.env.CXRG_GATEWAY_URL || 'http://127.0.0.1:4318/health')).json()).service);
await check('master-key-configured', async () => process.env.CXRG_MASTER_KEY ? 'environment' : 'missing (Desktop safeStorage may provide it)');
await check('control-token-configured', async () => { if (!process.env.CXRG_CONTROL_TOKEN) throw new Error('missing (required for standalone control service)'); return 'configured'; });
await check('release-manifest', async () => {
  const file = path.resolve(process.env.CXRG_RELEASE_MANIFEST || 'apps/desktop/release/manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  return { version: manifest.version, signed: manifest.signed, artifacts: manifest.artifacts?.length || 0 };
});

console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));
if (checks.some((check) => !check.ok)) process.exitCode = 1;
