import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isTrustedDocumentUrl } = require('../../apps/desktop/electron/security.cjs');

test('Electron trusts only the packaged app document or exact dev origin', () => {
  const appIndexPath = 'C:/Program Files/Cx-Routing Gateway/resources/app.asar/dist/index.html';
  assert.equal(isTrustedDocumentUrl({ url: 'file:///C:/Program%20Files/Cx-Routing%20Gateway/resources/app.asar/dist/index.html', appIndexPath }), true);
  assert.equal(isTrustedDocumentUrl({ url: 'file:///C:/Users/Public/attacker.html', appIndexPath }), false);
  assert.equal(isTrustedDocumentUrl({ url: 'http://127.0.0.1:5173/dashboard', appIndexPath, devServerUrl: 'http://127.0.0.1:5173' }), true);
  assert.equal(isTrustedDocumentUrl({ url: 'http://127.0.0.1:5173@attacker.example/dashboard', appIndexPath, devServerUrl: 'http://127.0.0.1:5173' }), false);
});
