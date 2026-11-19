import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function versionParts(value) {
  const parts = String(value).split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) throw new Error(`Invalid version: ${value}`);
  return parts;
}
export function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { redirect: 'error' });
  if (!response.ok) throw new Error(`Update manifest returned ${response.status}`);
  return response.json();
}

function verifyManifest(manifest, product) {
  if (manifest.product !== product) throw new Error('Update manifest product mismatch');
  const { signature, publicKey, ...unsignedPayload } = manifest;
  const signed = manifest.signed === true && typeof signature === 'string' && typeof publicKey === 'string' && crypto.verify(null, Buffer.from(JSON.stringify(unsignedPayload)), publicKey, Buffer.from(signature, 'base64'));
  return { manifest, signed };
}

export async function checkUpdate({ manifestUrl, currentVersion, product = 'Cx-Routing Gateway' }) {
  if (!currentVersion) throw new Error('currentVersion is required');
  const { manifest, signed } = verifyManifest(await fetchManifest(manifestUrl), product);
  const comparison = compareVersions(manifest.version, currentVersion);
  return { available: comparison > 0 && signed, version: manifest.version, signed, artifacts: manifest.artifacts || [] };
}

export async function installUpdate({ manifestUrl, currentVersion, product = 'Cx-Routing Gateway', downloadDir }) {
  if (!currentVersion) throw new Error('currentVersion is required');
  const { manifest, signed } = verifyManifest(await fetchManifest(manifestUrl), product);
  if (!signed || compareVersions(manifest.version, currentVersion) <= 0) throw new Error('No verified update is available');
  const artifact = (manifest.artifacts || []).find((item) => typeof item?.path === 'string' && /\.exe$/i.test(item.path) && !/blockmap|win-unpacked/i.test(item.path));
  if (!artifact || typeof artifact.sha256 !== 'string') throw new Error('Update manifest has no verified installer artifact');
  if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..') || artifact.path.includes('://')) throw new Error('Invalid update artifact path');
  const artifactUrl = new URL(artifact.path.replaceAll('\\', '/'), new URL('./', manifestUrl));
  const response = await fetch(artifactUrl, { redirect: 'error' });
  if (!response.ok) throw new Error(`Update artifact returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error('Update artifact hash mismatch');
  const targetDir = downloadDir || path.join(process.env.TEMP || process.cwd(), 'cxrg-updates');
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, path.basename(artifact.path));
  const temporaryPath = `${targetPath}.${process.pid}.part`;
  await fs.writeFile(temporaryPath, bytes, { mode: 0o700 });
  await fs.rename(temporaryPath, targetPath);
  return { version: manifest.version, path: targetPath, bytes: bytes.length, sha256: hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestUrl = process.env.CXRG_UPDATE_MANIFEST_URL;
  if (!manifestUrl) throw new Error('CXRG_UPDATE_MANIFEST_URL is required');
  const currentVersion = process.env.CXRG_CURRENT_VERSION || JSON.parse(await fs.readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf8')).version;
  console.log(JSON.stringify(await checkUpdate({ manifestUrl, currentVersion }), null, 2));
}
