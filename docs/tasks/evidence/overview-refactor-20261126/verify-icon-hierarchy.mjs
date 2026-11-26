import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const driverPath = process.argv[2];
if (!driverPath) throw new Error('Pass the installed taste-skill scripts/lib/cdp.mjs path.');
const { Browser } = await import(pathToFileURL(resolve(driverPath)).href);
const root = resolve('apps/desktop/dist');
const output = resolve('docs/tasks/evidence/overview-refactor-20261126/visual-icon-hierarchy');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
let browser;
const results = [];
try {
  browser = await Browser.launch();
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ width, height, reducedMotion: true });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const measurement = await page.eval(() => {
      const main = document.getElementById('main-content');
      const groups = [...document.querySelectorAll('.overview-config-metric, .overview-metrics > [role="group"]')];
      return {
        width: innerWidth,
        overflow: main.scrollWidth - main.clientWidth,
        groups: groups.map((group) => {
          const icon = group.querySelector('.overview-icon');
          const value = group.querySelector('.overview-status__count, .overview-metric__value');
          const caption = group.querySelector('.overview-status__caption, .overview-metric__caption');
          return {
            label: group.getAttribute('aria-label'),
            iconSize: icon.getBoundingClientRect().width,
            numberSize: parseFloat(getComputedStyle(value).fontSize),
            captionSize: parseFloat(getComputedStyle(caption).fontSize),
            text: value.textContent,
          };
        }),
        gatewayIcon: document.querySelector('.overview-status--gateway .overview-icon').getBoundingClientRect().width,
        gatewayStatus: parseFloat(getComputedStyle(document.querySelector('.overview-status__state')).fontSize),
        configurationLinks: [...document.querySelectorAll('.overview-config-metric a')].map((link) => link.getAttribute('href')),
      };
    });
    assert.equal(measurement.overflow, 0);
    assert.equal(measurement.gatewayIcon, 48);
    assert.equal(measurement.gatewayStatus, 13);
    assert.equal(measurement.groups.length, 5);
    assert.deepEqual(measurement.configurationLinks, ['#/routes', '#/credentials']);
    for (const group of measurement.groups) {
      assert.equal(group.iconSize, 40);
      assert.ok(group.numberSize >= 24 && group.numberSize <= 28);
      assert.ok(group.captionSize >= 12 && group.captionSize <= 13);
      assert.ok(group.iconSize > group.numberSize && group.numberSize > group.captionSize);
    }
    if (width === 390) {
      for (const [selector, name] of [['.overview-status--configuration', 'mobile-config'], ['.overview-metrics', 'mobile-metrics']]) {
        await page.eval((target) => document.querySelector(target).scrollIntoView({ block: 'start', behavior: 'instant' }), selector);
        await page.screenshot({ path: resolve(output, `${name}.jpg`) });
      }
    }
    assert.equal(page.consoleErrors.length, 0);
    results.push(measurement);
    await page.close();
  }
  await writeFile(resolve(output, 'computed-hierarchy.json'), JSON.stringify({ source: 'browser fixture; not Desktop IPC', results }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((closed) => server.close(closed));
}
