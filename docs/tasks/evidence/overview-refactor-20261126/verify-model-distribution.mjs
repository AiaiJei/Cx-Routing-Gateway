import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const driverPath = process.argv[2];
if (!driverPath) throw new Error('Pass the installed taste-skill scripts/lib/cdp.mjs path.');
const { Browser } = await import(pathToFileURL(resolve(driverPath)).href);
const { createServer } = await import(pathToFileURL(resolve('apps/desktop/node_modules/vite/dist/node/index.js')).href);
const repoRoot = resolve('.');
const appRoot = resolve('apps/desktop');
const output = resolve('docs/tasks/evidence/overview-refactor-20261126/visual-model-distribution');
const fixtureSource = '/@fs/' + resolve('docs/tasks/evidence/overview-refactor-20261126/model-distribution-fixture.jsx').replaceAll('\\', '/');
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve(appRoot, 'vite.config.ts'), root: appRoot, logLevel: 'error',
  cacheDir: resolve('.superpowers/sdd/2026-11-26-overview-refactor/model-distribution-vite-cache'),
  resolve: { alias: { react: resolve(appRoot, 'node_modules/react'), 'react-dom': resolve(appRoot, 'node_modules/react-dom'), 'react-router': resolve(appRoot, 'node_modules/react-router') }, dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot] } },
  plugins: [{ name: 'local-model-distribution-fixture', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url !== '/model-distribution-fixture.html') return next();
      const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="${encodeURI(fixtureSource)}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
await server.listen();
const address = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const results = [];
async function changeSelect(page, selector, value) {
  await page.eval(async ({ selector, value }) => {
    const control = document.querySelector(selector);
    control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  }, { selector, value });
}
async function measure(page) {
  return page.eval(() => {
    const section = document.querySelector('.overview-models');
    const chart = section.querySelector('svg[data-total]');
    const segments = [...chart.querySelectorAll('circle[data-model]')];
    const legend = section.querySelector('.overview-model-legend');
    const buttons = [...legend.querySelectorAll('button[data-model]')];
    const total = Number(chart.getAttribute('data-total'));
    const expectedTotal = Number(document.querySelector('[data-day-total]')?.getAttribute('data-day-total') ?? document.querySelector('[aria-label="调用总数"] strong').textContent.replaceAll(',', ''));
    return { height: section.getBoundingClientRect().height, legendHeight: legend.getBoundingClientRect().height,
      charts: section.querySelectorAll('svg[role="img"]').length, segments: segments.length, legendRows: buttons.length,
      colors: new Set(segments.map((segment) => getComputedStyle(segment).stroke)).size,
      colorsMatch: segments.every((segment) => getComputedStyle(segment).stroke === getComputedStyle(buttons.find((button) => button.dataset.model === segment.dataset.model).querySelector('.overview-model-swatch')).backgroundColor),
      shareSum: segments.reduce((sum, segment) => sum + Number(segment.dataset.share), 0), total, expectedTotal,
      yesterdayPresent: segments.some((segment) => segment.dataset.model === 'yesterday-only'),
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      mainOverflow: document.getElementById('main-content') ? document.getElementById('main-content').scrollWidth - document.getElementById('main-content').clientWidth : 0,
      hasPaging: !!section.querySelector('[aria-label="下一组模型"]'), legendScroll: legend.scrollTop,
      selected: document.getElementById('overview-model-select')?.value };
  });
}
function assertDistribution(result, count) {
  assert.equal(result.charts, 1); assert.equal(result.segments, count); assert.equal(result.legendRows, count);
  assert.equal(result.colors, count); assert.equal(result.colorsMatch, true); assert.equal(result.total, result.expectedTotal);
  assert.ok(Math.abs(result.shareSum - (count ? 1 : 0)) < 1e-12);
  assert.equal(result.pageOverflow, 0); assert.equal(result.mainOverflow, 0); assert.equal(result.hasPaging, false);
}
try {
  browser = await Browser.launch();
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    const page = await browser.newPage({ width, height, reducedMotion: true });
    const consoleErrors = [];
    const offConsole = page.browser.on(page.sessionId, 'Runtime.consoleAPICalled', (event) => { if (event.type === 'error') consoleErrors.push(event.args.map((argument) => argument.value ?? argument.description).join(' ')); });
    await page.goto(address);
    assert.equal(await page.eval(() => document.getElementById('overview-range').value), 'today');
    const today = await measure(page); assertDistribution(today, 0);
    await page.screenshot({ path: resolve(output, `app-default-today-${width}.jpg`) });
    await changeSelect(page, '#overview-range', 'retained');
    const retained = await measure(page); assertDistribution(retained, 2);
    await page.eval(() => document.querySelector('.overview-models').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: resolve(output, `app-retained-${width}.jpg`) });
    await page.goto(`${address}/model-distribution-fixture.html`);
    const dailySix = await measure(page); assertDistribution(dailySix, 6);
    assert.equal(dailySix.total, 100); assert.equal(dailySix.yesterdayPresent, false);
    await page.screenshot({ path: resolve(output, `daily-six-models-${width}.jpg`) });
    if (width === 1440) {
      const clip = await page.eval(() => { const bounds = document.querySelector('.overview-models').getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; });
      await page.screenshot({ path: resolve(output, 'daily-six-models-panel-1440.jpg'), clip });
    }
    const sizes = [];
    for (const count of [2, 60, 200]) {
      await changeSelect(page, '[aria-label="模型数量"]', String(count));
      const current = await measure(page); assertDistribution(current, count);
      assert.equal(current.height, dailySix.height); assert.equal(current.legendHeight, 288);
      assert.equal(current.yesterdayPresent, false); sizes.push({ count, ...current });
    }
    const lastName = await page.eval(() => document.querySelector('#overview-model-select option:last-child').value);
    await changeSelect(page, '#overview-model-select', lastName);
    const last = await measure(page); assertDistribution(last, 200);
    assert.equal(last.selected, lastName); assert.ok(last.legendScroll > 0); assert.equal(last.height, dailySix.height);
    await page.screenshot({ path: resolve(output, `all-models-${width}.jpg`) });
    assert.deepEqual(page.consoleErrors, []); assert.deepEqual(consoleErrors, []);
    results.push({ width, today, retained, dailySix, sizes, last, consoleErrors, exceptions: page.consoleErrors });
    offConsole(); await page.close();
  }
  await writeFile(resolve(output, 'distribution-checks.json'), JSON.stringify({ source: 'Browser fixtures and explicitly labeled current-day synthetic request records; not Desktop IPC', results }, null, 2) + '\n');
  console.log(JSON.stringify({ passedWidths: results.map((result) => result.width), allModelsInSingleChart: true, modelCounts: [2, 6, 60, 200], colorsMatchLegend: true, yesterdayExcluded: true, totalsReconcile: true }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
