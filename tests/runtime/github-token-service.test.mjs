import test from 'node:test';
import assert from 'node:assert/strict';
import tokenServiceModule from '../../apps/desktop/electron/github-token-service.cjs';

const { createGitHubTokenService } = tokenServiceModule;
const token = 'github_pat_test_123456789';

function setup({ available = true, verifyToken = async () => ({ valid: true }) } = {}) {
  const calls = [];
  const store = {
    async hasToken() { calls.push('hasToken'); return true; },
    async getToken() { calls.push('getToken'); return token; },
    async setToken(value) { calls.push(['setToken', value]); return { configured: true }; },
    async removeToken() { calls.push('removeToken'); return { configured: false }; },
  };
  const service = createGitHubTokenService({ store, safeStorage: { isEncryptionAvailable: () => available }, verifyToken: async (input) => { calls.push(['verifyToken', input.token]); return verifyToken(input); } });
  return { service, calls };
}

test('token service verifies repository access before persisting a token', async () => {
  const { service, calls } = setup();
  assert.deepEqual(await service.save(token), { configured: true });
  assert.deepEqual(calls, [['verifyToken', token], ['setToken', token]]);
});

test('token service never persists a token when repository verification fails', async () => {
  const { service, calls } = setup({ verifyToken: async () => { throw new Error(`Rejected ${token}`); } });
  await assert.rejects(() => service.save(token), (error) => {
    assert.equal(error.message.includes(token), false);
    assert.match(error.message, /Rejected/);
    return true;
  });
  assert.deepEqual(calls, [['verifyToken', token]]);
});

test('token service does not contact GitHub or persist when secure storage is unavailable', async () => {
  const { service, calls } = setup({ available: false });
  await assert.rejects(() => service.save(token), /secure storage is unavailable/i);
  assert.deepEqual(calls, []);
});

test('token status exposes only configured and secure-storage state', async () => {
  const { service } = setup();
  assert.deepEqual(await service.getStatus(), { configured: true, secureStorageAvailable: true });
});

test('token service exposes credential reads only to its main-process caller and supports removal', async () => {
  const { service, calls } = setup();
  assert.equal(await service.getToken(), token);
  assert.deepEqual(await service.remove(), { configured: false });
  assert.deepEqual(calls, ['getToken', 'removeToken']);
});
