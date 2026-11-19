import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Desktop production build uses relative asset URLs for file loading', async () => {
  const html = await fs.readFile('apps/desktop/dist/index.html', 'utf8');
  assert.match(html, /src="\.\/assets\//);
  assert.match(html, /href="\.\/assets\//);
});
