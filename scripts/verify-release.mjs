import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const releaseDir = path.resolve(process.argv[2] || 'apps/desktop/release');
const localTest = process.argv.includes('--local-test');
const { version, cxrgProductVersion } = JSON.parse(await fs.readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'));
const builderConfig = await fs.readFile(new URL('../apps/desktop/electron-builder.yml', import.meta.url), 'utf8');
if (!builderConfig.split(/\r?\n/).some((line) => line.trim() === `buildVersion: ${cxrgProductVersion}`)) throw new Error('electron-builder buildVersion does not match cxrgProductVersion');
if (version !== '1.1.15.1' || cxrgProductVersion !== '1.1.15.1') throw new Error('Invalid Cx-Routing Gateway package/product version metadata');
const productVersion = cxrgProductVersion;
const packagedRuntime = [
  'win-unpacked/Cx-Routing Gateway.exe',
  'win-unpacked/resources/app.asar',
  'win-unpacked/resources/runtime/services/local-control/src/server.mjs',
  'win-unpacked/resources/runtime/services/gateway/src/server.mjs',
  'win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs',
  'win-unpacked/resources/runtime/packages/shared/src/config-store.mjs', 'win-unpacked/resources/runtime/packages/shared/src/config-lock.mjs', 'win-unpacked/resources/runtime/packages/shared/src/destination-policy.mjs',
  'win-unpacked/resources/runtime/packages/shared/src/secret-vault.mjs',
  'win-unpacked/resources/runtime/scripts/check-update.mjs',
];
const required = [
  ...packagedRuntime,
  ...(localTest ? [] : [
  `Cx-Routing Gateway Setup ${productVersion}.exe`,
  `Cx-Routing Gateway Setup ${productVersion}.exe.blockmap`,
  ]),
  `Cx-Routing Gateway Portable ${productVersion}.exe`,
];

const artifacts = [];
for (const relative of required) {
  const filePath = path.join(releaseDir, relative);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) throw new Error(`Missing or empty release artifact: ${relative}`);
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(filePath));
  artifacts.push({ path: relative, bytes: stat.size, sha256: hash.digest('hex') });
}

const privateKey = process.env.CXRG_RELEASE_PRIVATE_KEY;
const publicKey = process.env.CXRG_RELEASE_PUBLIC_KEY;
const manifest = { product: 'Cx-Routing Gateway', version: productVersion, packageVersion: version, platform: 'win32', generatedAt: new Date().toISOString(), signed: Boolean(privateKey && publicKey), artifacts };
if (privateKey && publicKey) {
  manifest.signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString('base64');
  manifest.publicKey = publicKey;
}
if (process.argv.includes('--write')) await fs.writeFile(path.join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
