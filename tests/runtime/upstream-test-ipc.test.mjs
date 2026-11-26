import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUpstreamTestIpc } from '../../apps/desktop/electron/upstream-test-ipc.cjs';

function setup({ response, trusted = true } = {}) {
  const handlers = new Map();
  const requests = [];
  registerUpstreamTestIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: () => trusted,
    getControlPort: () => 4319,
    getControlToken: () => 'test-control-token',
    fetchImpl: async (...args) => { requests.push(args); return response; },
  });
  return { handler: handlers.get('runtime:test-upstream'), requests };
}

test('upstream test explains a changed DNS approval and the user recovery action', async () => {
  const { handler, requests } = setup({
    response: { ok: false, status: 502, json: async () => ({ ok: false, error: 'destination_changed' }) },
  });

  await assert.rejects(handler({ senderFrame: {} }, 'up/id'), error => {
    assert.match(error.message, /DNS 地址已变化/);
    assert.match(error.message, /编辑并重新保存 Base URL/);
    return true;
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'http://127.0.0.1:4319/v1/control/upstreams/up%2Fid/test');
  assert.deepEqual(requests[0][1], {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-control-token' },
    body: '{}',
  });
});

test('upstream test returns a successful Local Control response unchanged', async () => {
  const body = { ok: true, models: ['local-model'] };
  const { handler } = setup({ response: { ok: true, status: 200, json: async () => body } });

  assert.deepEqual(await handler({ senderFrame: {} }, 'up-1'), body);
});

test('upstream test failures do not expose arbitrary Local Control response text', async () => {
  const { handler } = setup({
    response: { ok: false, status: 502, json: async () => ({ ok: false, error: 'unavailable', detail: 'private upstream text' }) },
  });

  await assert.rejects(handler({ senderFrame: {} }, 'up-1'), error => {
    assert.match(error.message, /HTTP 502/);
    assert.doesNotMatch(error.message, /private upstream text/);
    return true;
  });
});
