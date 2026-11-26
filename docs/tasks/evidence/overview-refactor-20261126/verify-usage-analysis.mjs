import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const driverPath = process.argv[2];
if (!driverPath) throw new Error('Pass the installed taste-skill scripts/lib/cdp.mjs path.');
const { Browser } = await import(pathToFileURL(resolve(driverPath)).href);
const root = resolve('apps/desktop/dist');
const output = resolve('docs/tasks/evidence/overview-refactor-20261126/visual-usage-analysis');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(root + sep)) return response.writeHead(403).end();
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
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    const page = await browser.newPage({ width, height, reducedMotion: true });
    const consoleMessages = [];
    const offConsole = page.browser.on(page.sessionId, 'Runtime.consoleAPICalled', (event) => {
      if (event.type === 'error') consoleMessages.push(event.args.map((argument) => argument.value ?? argument.description).join(' '));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const initial = await page.eval(() => {
      const main = document.getElementById('main-content');
      const modelRows = [...document.querySelectorAll('.overview-model-table tbody tr')];
      return {
        width: innerWidth,
        overflow: main.scrollWidth - main.clientWidth,
        calls: document.querySelector('[aria-label="调用总数"] strong').textContent,
        totalTokens: document.querySelector('[aria-label="已上报 Token"] strong').textContent,
        rangeControlHeight: document.getElementById('overview-range').getBoundingClientRect().height,
        models: modelRows.map((row) => ({ name: row.querySelector('th').textContent, calls: Number(row.querySelector('td strong').textContent), bar: Number(row.querySelector('svg rect:last-child').getAttribute('width')) })),
        hierarchy: [...document.querySelectorAll('.overview-metrics > [role="group"]')].map((group) => ({
          icon: group.querySelector('.overview-icon').getBoundingClientRect().width,
          value: parseFloat(getComputedStyle(group.querySelector('.overview-metric__value')).fontSize),
          status: parseFloat(getComputedStyle(group.querySelector('.overview-metric__caption')).fontSize),
        })),
      };
    });
    assert.equal(initial.overflow, 0);
    assert.equal(initial.calls, '3');
    assert.equal(initial.totalTokens, '1,854');
    assert.deepEqual(initial.models.map((model) => model.calls), [2, 1]);
    assert.deepEqual(initial.models.map((model) => model.bar), [100, 50]);
    assert.equal(initial.hierarchy.length, 4);
    if (width === 390) assert.ok(initial.rangeControlHeight >= 44);
    for (const item of initial.hierarchy) assert.deepEqual(item, { icon: 40, value: 28, status: 12 });
    await page.eval(() => document.querySelector('.overview-models').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: resolve(output, `models-${width}.jpg`) });
    let scroll;
    if (width < 1100) {
      scroll = await page.eval(async () => {
        const region = document.querySelector('.overview-models .table-scroll');
        const before = region.querySelector('tbody th').getBoundingClientRect().left;
        region.focus();
        region.scrollLeft = region.scrollWidth;
        await new Promise(requestAnimationFrame);
        return { offset: region.scrollLeft, before, after: region.querySelector('tbody th').getBoundingClientRect().left, focused: document.activeElement === region };
      });
      assert.ok(scroll.offset > 0);
      assert.ok(Math.abs(scroll.before - scroll.after) < 2);
      assert.equal(scroll.focused, true);
      await page.screenshot({ path: resolve(output, `models-scrolled-${width}.jpg`) });
    }
    const filtered = await page.eval(async () => {
      const select = document.getElementById('overview-range');
      select.value = '24h';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      document.getElementById('main-content').scrollTop = 0;
      return {
        calls: document.querySelector('[aria-label="调用总数"] strong').textContent,
        totalTokens: document.querySelector('[aria-label="已上报 Token"] strong').textContent,
        empty: document.querySelector('.overview-models').textContent.includes('当前范围内没有模型调用记录'),
      };
    });
    assert.deepEqual(filtered, { calls: '0', totalTokens: '—', empty: true });
    await page.screenshot({ path: resolve(output, `empty-24h-${width}.jpg`) });
    const restored = await page.eval(async () => {
      const select = document.getElementById('overview-range');
      select.value = 'retained';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(requestAnimationFrame);
      document.querySelector('.overview-filters button').click();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return document.querySelector('[aria-label="调用总数"] strong').textContent;
    });
    assert.equal(restored, '3');
    const layoutStress = await page.eval(async () => {
      document.querySelector('.overview-model-name').textContent = 'layout-stress-only-model-identifier-'.repeat(5);
      document.querySelector('[aria-label="已上报 Token"] strong').textContent = '9,007,199,254,740,991';
      await new Promise(requestAnimationFrame);
      const main = document.getElementById('main-content');
      const value = document.querySelector('[aria-label="已上报 Token"] strong');
      return { source: 'synthetic DOM layout stress only, not usage data', overflow: main.scrollWidth - main.clientWidth, valueOverflow: value.scrollWidth - value.clientWidth };
    });
    assert.equal(layoutStress.overflow, 0);
    assert.equal(layoutStress.valueOverflow, 0);
    assert.deepEqual(page.consoleErrors, []);
    assert.deepEqual(consoleMessages, []);
    results.push({ ...initial, scroll, filtered, refreshRestored: restored, layoutStress, consoleExceptions: page.consoleErrors, consoleMessages });
    offConsole();
    await page.close();
  }
  await writeFile(resolve(output, 'interaction-checks.json'), JSON.stringify({ source: 'browser fixture only; not Desktop IPC or provider runtime', results }, null, 2) + '\n');
  console.log(JSON.stringify({ passedWidths: results.map((result) => result.width), checks: 'usage totals, model bars, hierarchy, range changes, refresh, mobile sticky identity, console' }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((closed) => server.close(closed));
}
