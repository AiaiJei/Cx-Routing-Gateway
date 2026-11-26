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
const output = resolve('docs/tasks/evidence/overview-refactor-20261126/visual-model-chart');
const fixtureSource = '/@fs/' + resolve('docs/tasks/evidence/overview-refactor-20261126/model-chart-fixture.jsx').replaceAll('\\', '/');
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve(appRoot, 'vite.config.ts'), root: appRoot, logLevel: 'error',
  cacheDir: resolve('.superpowers/sdd/2026-11-26-overview-refactor/model-chart-vite-cache'),
  resolve: { alias: { react: resolve(appRoot, 'node_modules/react'), 'react-dom': resolve(appRoot, 'node_modules/react-dom'), 'react-router': resolve(appRoot, 'node_modules/react-router') }, dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot] } },
  plugins: [{ name: 'local-model-chart-fixture', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url !== '/model-chart-fixture.html') return next();
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
    const chart = section.querySelector('svg[data-maximum]');
    const ticks = [...section.querySelectorAll('.overview-comparison-axis > div span')].filter((tick) => getComputedStyle(tick).display !== 'none').map((tick) => ({ left: tick.getBoundingClientRect().left, right: tick.getBoundingClientRect().right, text: tick.textContent }));
    return { height: section.getBoundingClientRect().height, plotHeight: chart.getBoundingClientRect().height,
      bars: chart.querySelectorAll('rect[data-model]').length, maximum: chart.getAttribute('data-maximum'),
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      mainOverflow: document.getElementById('main-content') ? document.getElementById('main-content').scrollWidth - document.getElementById('main-content').clientWidth : 0,
      tickOverlap: ticks.some((tick, index) => index > 0 && tick.left < ticks[index - 1].right - 1), ticks,
      tableCount: section.querySelectorAll('table').length, selected: document.getElementById('overview-model-select').value };
  });
}
try {
  browser = await Browser.launch();
  const viewports = process.argv.includes('--phone-only') ? [[390, 844]] : [[1440, 900], [768, 1024], [390, 844]];
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ width, height, reducedMotion: true });
    const consoleErrors = [];
    const offConsole = page.browser.on(page.sessionId, 'Runtime.consoleAPICalled', (event) => { if (event.type === 'error') consoleErrors.push(event.args.map((argument) => argument.value ?? argument.description).join(' ')); });
    await page.goto(address);
    await page.eval(() => document.querySelector('.overview-models').scrollIntoView({ block: 'start' }));
    const fixture = await measure(page);
    assert.equal(fixture.bars, 2); assert.equal(fixture.tableCount, 0); assert.equal(fixture.plotHeight, 220); assert.equal(fixture.mainOverflow, 0); assert.equal(fixture.tickOverlap, false);
    await page.screenshot({ path: resolve(output, `chart-focus-${width}.jpg`) });
    for (const metric of ['tokens', 'successRate', 'duration', 'calls']) {
      await changeSelect(page, '#overview-model-metric', metric);
      const result = await measure(page);
      if (result.tickOverlap) {
        console.log(JSON.stringify({ width, metric, ticks: result.ticks }));
        await page.screenshot({ path: resolve(output, `axis-overlap-before-${width}.jpg`) });
      }
      assert.equal(result.plotHeight, 220); assert.equal(result.tickOverlap, false);
      assert.equal(result.pageOverflow, 0); assert.equal(result.mainOverflow, 0);
      if (metric === 'successRate') assert.equal(result.maximum, '100');
      if (metric === 'tokens') await page.screenshot({ path: resolve(output, `chart-tokens-${width}.jpg`) });
    }
    await page.goto(`${address}/model-chart-fixture.html`);
    const many = await measure(page);
    assert.equal(many.bars, 5); assert.equal(many.plotHeight, 220); assert.equal(many.tableCount, 0);
    await page.screenshot({ path: resolve(output, `many-models-${width}.jpg`) });
    await changeSelect(page, '[aria-label="模型数量"]', '2');
    const few = await measure(page);
    await changeSelect(page, '[aria-label="模型数量"]', '200');
    const larger = await measure(page);
    assert.equal(few.height, many.height); assert.equal(larger.height, many.height);
    assert.equal(larger.bars, 5); assert.equal(larger.pageOverflow, 0); assert.equal(larger.tickOverlap, false);
    await page.eval(async () => { document.querySelector('[aria-label="下一组模型"]').click(); await new Promise(requestAnimationFrame); });
    const next = await measure(page);
    assert.equal(next.maximum, larger.maximum); assert.equal(next.height, larger.height);
    const lastName = await page.eval(() => document.querySelector('#overview-model-select option:last-child').value);
    await changeSelect(page, '#overview-model-select', lastName);
    const located = await measure(page);
    assert.equal(located.selected, lastName); assert.equal(located.height, many.height); assert.equal(located.bars, 5);
    await page.screenshot({ path: resolve(output, `last-group-${width}.jpg`) });
    assert.deepEqual(page.consoleErrors, []); assert.deepEqual(consoleErrors, []);
    results.push({ width, productionFixture: fixture, synthetic60: many, synthetic2: few, synthetic200: larger, nextGroup: next, located, consoleErrors, exceptions: page.consoleErrors });
    offConsole(); await page.close();
  }
  await writeFile(resolve(output, 'bounded-height-checks.json'), JSON.stringify({ source: 'Browser fixture plus explicitly labeled synthetic component harness; not Desktop IPC', results }, null, 2) + '\n');
  console.log(JSON.stringify({ passedWidths: results.map((result) => result.width), modelCounts: [2, 60, 200], fixedPlotHeight: 220, sameSectionHeightAtEachWidth: true }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
