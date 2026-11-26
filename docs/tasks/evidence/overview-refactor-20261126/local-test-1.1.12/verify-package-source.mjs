import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(path.resolve('apps/desktop/package.json'));
const asar = await import(pathToFileURL(require.resolve('@electron/asar')).href);
const archive = path.resolve('apps/desktop/release/1.1.12-overview-test-20261127/win-unpacked/resources/app.asar');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(metadata.version, '1.1.12');
assert.equal(metadata.cxrgProductVersion, '1.1.12');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const sourceMatches = Object.fromEntries(['electron/main.cjs', 'electron/desktop-profile.cjs'].map((file) => {
  const matches = digest(asar.extractFile(archive, path.normalize(file))) === digest(fs.readFileSync(path.join('apps/desktop', file)));
  assert.equal(matches, true, file);
  return [file, matches];
}));
const asset = asar.listPackage(archive).map((file) => file.replaceAll('\\', '/')).find((file) => /^\/dist\/assets\/index-.*\.js$/.test(file));
assert.ok(asset);
const bundle = asar.extractFile(archive, path.normalize(asset.slice(1))).toString();
assert.ok(bundle.includes('overview-model-ring'));
assert.ok(bundle.includes('data-total'));
const result = { version: metadata.version, productVersion: metadata.cxrgProductVersion, sourceMatches, uiBundle: asset, containsAggregateModelChart: true };
fs.writeFileSync('docs/tasks/evidence/overview-refactor-20261126/local-test-1.1.12/archive-check.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
