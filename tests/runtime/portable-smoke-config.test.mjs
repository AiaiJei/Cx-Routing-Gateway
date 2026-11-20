import test from 'node:test';
import assert from 'node:assert/strict';
import { reservePortableSmokePorts } from '../../scripts/portable-smoke-config.mjs';

test('portable smoke reserves distinct non-default ports and passes them to the app', async () => {
  const ports = await reservePortableSmokePorts();
  try {
    assert.notEqual(ports.controlPort, ports.gatewayPort);
    assert.notEqual(ports.controlPort, 4319);
    assert.notEqual(ports.gatewayPort, 4318);
    assert.equal(ports.environment.CXRG_CONTROL_PORT, String(ports.controlPort));
    assert.equal(ports.environment.CXRG_GATEWAY_PORT, String(ports.gatewayPort));
    assert.equal(ports.controlUrl, `http://127.0.0.1:${ports.controlPort}/health`);
    assert.equal(ports.gatewayUrl, `http://127.0.0.1:${ports.gatewayPort}/health`);
  } finally {
    await ports.release();
  }
});
