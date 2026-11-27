import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { configureDesktopProfile } from '../../apps/desktop/electron/desktop-profile.cjs';

test('normal desktop startup keeps default user and session data paths', () => {
  const unexpected = () => { throw new Error('default startup must not override paths'); };
  assert.equal(configureDesktopProfile({ app: { setPath: unexpected }, directory: undefined, mkdir: unexpected }), false);
  assert.equal(configureDesktopProfile({ app: { setPath: unexpected }, directory: '', mkdir: unexpected }), false);
});

test('explicit profile creates its directory before isolating user and session data', () => {
  const directory = path.resolve('.tmp/isolated-desktop-profile');
  const calls = [];
  const result = configureDesktopProfile({ app: { setPath: (name, value) => calls.push([name, value]) }, directory, mkdir: (value, options) => calls.push(['mkdir', value, options]) });
  assert.equal(result, true);
  assert.deepEqual(calls, [['mkdir', directory, { recursive: true }], ['userData', directory], ['sessionData', directory]]);
});

test('invalid profile paths fail before filesystem or Electron path mutation', () => {
  const unexpected = () => { throw new Error('must not mutate'); };
  for (const directory of ['relative/profile', ' ', null, 42]) {
    assert.throws(() => configureDesktopProfile({ app: { setPath: unexpected }, directory, mkdir: unexpected }), /absolute path/);
  }
});

test('profile creation failure does not silently fall back to existing user data', () => {
  let changed = false;
  assert.throws(() => configureDesktopProfile({ app: { setPath: () => { changed = true; } }, directory: path.resolve('.tmp/denied-profile'), mkdir: () => { throw new Error('access denied'); } }), /access denied/);
  assert.equal(changed, false);
});
