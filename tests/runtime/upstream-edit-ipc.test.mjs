import test from 'node:test';
import assert from 'node:assert/strict';
import ipcModule from '../../apps/desktop/electron/upstream-edit-ipc.cjs';

const { registerUpstreamEditIpc } = ipcModule;

function setup({ trusted = true, response = { ok: true, json: async () => ({ updated: true }) } } = {}) {
  const handlers = new Map();
  const requests = [];
  registerUpstreamEditIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: () => trusted,
    getControlPort: () => 4319,
    getControlToken: () => 'local-control-token',
    fetchImpl: async (...args) => { requests.push(args); return response; },
  });
  return { handlers, requests };
}

test('upstream edit IPC encodes the ID and patches only supplied fields with the control token', async () => {
  const { handlers, requests } = setup();
  const result = await handlers.get('runtime:update-upstream')({ senderFrame: { url: 'trusted' } }, 'upstream/a?', { name: '  Primary  ', baseUrl: '  https://api.example/v1  ' });
  assert.deepEqual(result, { updated: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'http://127.0.0.1:4319/v1/control/upstreams/upstream%2Fa%3F');
  assert.deepEqual(requests[0][1], {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer local-control-token' },
    body: JSON.stringify({ name: 'Primary', baseUrl: 'https://api.example/v1' }),
  });
});

test('upstream edit IPC sends a non-empty replacement key but omits blank keys', async () => {
  const { handlers, requests } = setup();
  await handlers.get('runtime:update-upstream')({ senderFrame: { url: 'trusted' } }, 'up-1', { name: 'Primary', baseUrl: 'https://api.example/v1', apiKey: 'replacement-secret' });
  await handlers.get('runtime:update-upstream')({ senderFrame: { url: 'trusted' } }, 'up-1', { name: 'Primary', baseUrl: 'https://api.example/v1', apiKey: '' });
  assert.equal(requests[0][1].body, JSON.stringify({ name: 'Primary', baseUrl: 'https://api.example/v1', apiKey: 'replacement-secret' }));
  assert.equal(requests[1][1].body, JSON.stringify({ name: 'Primary', baseUrl: 'https://api.example/v1' }));
});

test('upstream edit IPC rejects untrusted senders and malformed edits before network access', async () => {
  const untrusted = setup({ trusted: false });
  await assert.rejects(untrusted.handlers.get('runtime:update-upstream')({ senderFrame: { url: 'untrusted' } }, 'up-1', { name: 'Primary', baseUrl: 'https://api.example/v1' }), /Invalid upstream update/);
  assert.equal(untrusted.requests.length, 0);

  const trusted = setup();
  const handler = trusted.handlers.get('runtime:update-upstream');
  for (const [id, input] of [["", { name: 'Primary', baseUrl: 'https://api.example/v1' }], ['up-1', { name: '', baseUrl: 'https://api.example/v1' }], ['up-1', { name: 'Primary', baseUrl: 'https://api.example/v1', apiKey: 12 }]]) {
    await assert.rejects(handler({ senderFrame: { url: 'trusted' } }, id, input), /Invalid upstream update/);
  }
  assert.equal(trusted.requests.length, 0);
});
