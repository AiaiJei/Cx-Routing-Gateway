import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPOSITORY = 'AiaiJei/Cx-Routing-Gateway';
const REPOSITORY_CONTENTS_API = `https://api.github.com/repos/${DEFAULT_REPOSITORY}/contents`;
const RELEASES_API = `https://api.github.com/repos/${DEFAULT_REPOSITORY}/releases`;

function requireToken(token) {
  if (typeof token !== 'string' || !token || token.trim() !== token || /[\r\n\0]/.test(token)) {
    throw new Error('GitHub token is required');
  }
  return token;
}

function requireRepository(repository) {
  if (repository !== DEFAULT_REPOSITORY) throw new Error('GitHub repository is fixed for this application');
}

function versionParts(value) {
  const normalized = String(value).replace(/^v/, '');
  if (!/^\d+(?:\.\d+){2,3}$/.test(normalized)) throw new Error(`Invalid version: ${value}`);
  return normalized.split('.').map(Number).concat([0]).slice(0, 4);
}

export function compareVersions(left, right) {
  const a = versionParts(left); const b = versionParts(right);
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

function authorizationHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token === undefined ? {} : { authorization: `Bearer ${requireToken(token)}` }),
  };
}

function githubError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function verifyGitHubToken({ token, repository = DEFAULT_REPOSITORY, fetchImpl = fetch } = {}) {
  requireToken(token);
  requireRepository(repository);
  let response;
  try {
    response = await fetchImpl(REPOSITORY_CONTENTS_API, { headers: authorizationHeaders(token) });
  } catch {
    throw new Error('Unable to verify GitHub repository access');
  }
  if (!response.ok) {
    const code = [401, 403, 404].includes(response.status) ? 'GITHUB_ACCESS_DENIED' : undefined;
    throw githubError(`GitHub token cannot read repository contents (HTTP ${response.status})`, code);
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('GitHub returned invalid repository contents'); }
  if (!Array.isArray(result)) throw new Error('GitHub token cannot read repository contents');
  return { valid: true };
}

function releaseVersion(release) {
  if (!release || typeof release !== 'object' || release.draft !== false || release.prerelease !== false) throw new Error('GitHub latest release is not a stable published release');
  if (typeof release.tag_name !== 'string' || !/^v\d+(?:\.\d+){2,3}$/.test(release.tag_name)) throw new Error('GitHub release has an invalid version tag');
  const expectedUrl = `https://github.com/${DEFAULT_REPOSITORY}/releases/tag/${release.tag_name}`;
  if (release.html_url !== expectedUrl) throw new Error('GitHub release URL is invalid');
  return release.tag_name.slice(1);
}

function installerAsset(release, version) {
  const expectedNames = [`Cx-Routing Gateway Setup ${version}.exe`, `Cx-Routing.Gateway.Setup.${version}.exe`];
  const asset = Array.isArray(release.assets) ? release.assets.find((item) => expectedNames.includes(item?.name)) : null;
  if (!asset || typeof asset.browser_download_url !== 'string') throw new Error(`GitHub release is missing ${expectedNames[0]}`);
  if (!/^sha256:[a-f\d]{64}$/i.test(asset.digest || '')) throw new Error('GitHub release installer has no valid SHA-256 digest');
  const url = new URL(asset.browser_download_url);
  const expectedPath = `/AiaiJei/Cx-Routing-Gateway/releases/download/v${version}/`;
  let urlFilename;
  try { urlFilename = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)); } catch { throw new Error('GitHub release installer URL is invalid'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(expectedPath) || urlFilename !== asset.name || url.search || url.hash) {
    throw new Error('GitHub release installer URL is invalid');
  }
  return { name: asset.name, url: url.href, sha256: asset.digest.slice('sha256:'.length).toLowerCase() };
}

async function fetchLatestRelease({ repository, token, fetchImpl }) {
  requireRepository(repository);
  let response;
  try {
    response = await fetchImpl(`${RELEASES_API}/latest`, { headers: authorizationHeaders(token) });
  } catch {
    throw new Error('Unable to contact GitHub Releases API');
  }
  if (!response.ok) {
    const code = [401, 403, 404].includes(response.status) ? 'GITHUB_CREDENTIAL_RECHECK' : undefined;
    throw githubError(`GitHub Releases API returned ${response.status}`, code);
  }
  let release;
  try { release = await response.json(); } catch { throw new Error('GitHub Releases API returned invalid JSON'); }
  const version = releaseVersion(release);
  return { release, version, installer: installerAsset(release, version) };
}

export async function checkUpdate({ currentVersion, token, repository = DEFAULT_REPOSITORY, fetchImpl = fetch } = {}) {
  if (!currentVersion) throw new Error('currentVersion is required');
  const { release, version, installer } = await fetchLatestRelease({ repository, token, fetchImpl });
  return {
    configured: true,
    available: compareVersions(version, currentVersion) > 0,
    version,
    releaseUrl: release.html_url,
    installer: { name: installer.name, sha256: installer.sha256 },
  };
}

export async function installUpdate({ currentVersion, token, repository = DEFAULT_REPOSITORY, fetchImpl = fetch, downloadDir } = {}) {
  if (!currentVersion) throw new Error('currentVersion is required');
  const { version, installer } = await fetchLatestRelease({ repository, token, fetchImpl });
  if (compareVersions(version, currentVersion) <= 0) throw new Error('No verified update is available');
  let response;
  try {
    response = await fetchImpl(installer.url, { headers: authorizationHeaders(token) });
  } catch {
    throw new Error('Unable to download GitHub release installer');
  }
  if (!response.ok) {
    const code = [401, 403, 404].includes(response.status) ? 'GITHUB_CREDENTIAL_RECHECK' : undefined;
    throw githubError(`GitHub release installer returned ${response.status}`, code);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== installer.sha256) throw new Error('GitHub release installer SHA-256 mismatch');
  const targetDir = downloadDir || path.join(process.env.TEMP || process.cwd(), 'cxrg-updates');
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, installer.name);
  const temporaryPath = `${targetPath}.${process.pid}.part`;
  await fs.writeFile(temporaryPath, bytes, { mode: 0o700 });
  await fs.rename(temporaryPath, targetPath);
  return { version, path: targetPath, bytes: bytes.length, sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Check public GitHub Releases without a token: node scripts/check-update.mjs');
  else {
    try {
      const packageData = JSON.parse(await fs.readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'));
      console.log(JSON.stringify(await checkUpdate({ currentVersion: packageData.cxrgProductVersion })));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
