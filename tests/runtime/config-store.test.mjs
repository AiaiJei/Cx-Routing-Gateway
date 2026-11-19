import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';

test('ConfigStore creates a versioned empty configuration and persists updates atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-config-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  const initial = await store.read();
  assert.equal(initial.version, 1);
  assert.deepEqual(initial.upstreams, []);
  const updated = await store.update((config) => ({
    ...config,
    upstreams: [{ id: 'up-1', name: 'Local', baseUrl: 'http://127.0.0.1:9999', protocol: 'Chat', enabled: true }],
  }));
  assert.equal(updated.upstreams[0].id, 'up-1');
  const reread = await new ConfigStore(file).read();
  assert.deepEqual(reread, updated);
  await assert.doesNotReject(fs.access(`${file}.bak`));
});
