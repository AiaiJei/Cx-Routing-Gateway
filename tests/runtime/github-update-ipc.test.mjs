import test from 'node:test';
import assert from 'node:assert/strict';
import ipcModule from '../../apps/desktop/electron/github-update-ipc.cjs';

const { registerGitHubUpdateIpc } = ipcModule;
const token = 'github_pat_ipc_test_123456';

function setup({ trusted = true, tokenConfigured = true, verifyStoredToken = async () => true, updateError, installError } = {}) {
  const handlers = new Map();
  const calls = [];
  const tokenService = {
    async getStatus() { calls.push('getStatus'); return { configured: tokenConfigured, secureStorageAvailable: true }; },
    async save(value) { calls.push(['save', value]); return { configured: true }; },
    async getToken() { calls.push('getToken'); return tokenConfigured ? token : null; },
    async verifyStoredToken() { calls.push('verifyStoredToken'); return verifyStoredToken(); },
    async remove() { calls.push('remove'); return { configured: false }; },
  };
  const updater = {
    async verifyGitHubToken() { return { valid: true }; },
    async checkUpdate(input) {
      calls.push(['checkUpdate', input.token]);
      if (updateError) throw updateError;
      return { configured: true, available: true, version: '1.1.0', releaseUrl: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.1.0' };
    },
    async installUpdate(input) {
      calls.push(['installUpdate', input.token]);
      if (installError) throw installError;
      return { version: '1.1.0', path: 'verified-installer.exe' };
    },
  };
  const installed = [];
  registerGitHubUpdateIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: () => trusted,
    getTokenService: () => tokenService,
    loadUpdater: async () => updater,
    getCurrentVersion: () => '1.0.3',
    getDownloadDir: () => 'temp-updates',
    installDownloaded: async (result) => { installed.push(result); },
  });
  return { handlers, calls, installed };
}

test('update credential and release IPC rejects untrusted senders before invoking services', async () => {
  const { handlers, calls } = setup({ trusted: false });
  for (const channel of ['runtime:get-update-token-status', 'runtime:save-update-token', 'runtime:remove-update-token', 'runtime:check-update', 'runtime:install-update']) {
    await assert.rejects(() => handlers.get(channel)({ sender: {} }, token), /Untrusted runtime request/);
  }
  assert.deepEqual(calls, []);
});

test('token save IPC passes the submitted credential only to the main-process service', async () => {
  const { handlers, calls } = setup();
  const result = await handlers.get('runtime:save-update-token')({ sender: {} }, token);
  assert.deepEqual(result, { configured: true });
  assert.deepEqual(calls, [['save', token]]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('update check IPC removes a token only after the repository verifier confirms revocation', async () => {
  const error = Object.assign(new Error('GitHub Releases API returned 401'), { code: 'GITHUB_CREDENTIAL_RECHECK' });
  const { handlers, calls } = setup({ updateError: error, verifyStoredToken: async () => false });
  const result = await handlers.get('runtime:check-update')({ sender: {} });
  assert.deepEqual(result, { configured: false, available: false, tokenInvalid: true });
  assert.deepEqual(calls, ['getToken', ['checkUpdate', token], 'verifyStoredToken']);
});

test('update check IPC preserves valid tokens on release-not-found responses', async () => {
  const error = Object.assign(new Error('GitHub Releases API returned 404'), { code: 'GITHUB_CREDENTIAL_RECHECK' });
  const { handlers, calls } = setup({ updateError: error, verifyStoredToken: async () => true });
  await assert.rejects(() => handlers.get('runtime:check-update')({ sender: {} }), /returned 404/);
  assert.deepEqual(calls, ['getToken', ['checkUpdate', token], 'verifyStoredToken']);
});

test('install IPC launches only an installer returned by the digest-verifying updater', async () => {
  const { handlers, calls, installed } = setup();
  const result = await handlers.get('runtime:install-update')({ sender: {} });
  assert.deepEqual(installed, [{ version: '1.1.0', path: 'verified-installer.exe' }]);
  assert.deepEqual(result, { configured: true, installed: true, version: '1.1.0' });
  assert.deepEqual(calls, ['getToken', ['installUpdate', token]]);
});
