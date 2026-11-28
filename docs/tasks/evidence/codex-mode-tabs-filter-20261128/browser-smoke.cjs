const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CXRG_BROWSER_EXECUTABLE,
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1530, height: 960 } });
    await context.addInitScript(() => {
      const unconfigured = new URL(location.href).searchParams.has("empty");
      const names = ["gpt-6.1-sol", "claude-opus-5-5", "gemini-4-carbon", "glm-5.3", "deepseek-v4.1-flash-1017", "kimi-k3", "custom-model"];
      const routes = (unconfigured ? [] : names).map((name, index) => ({
        id: `fixture-${index}`, alias: name, enabled: true,
        inboundProtocol: "Res", outboundProtocol: "Res",
        targets: [{ upstreamId: "fixture-upstream", modelId: name }],
      }));
      let status = {
        configPath: "C:/isolated-fixture/config.toml", exists: true, revision: "fixture-before",
        configured: !unconfigured, mode: unconfigured ? "direct" : "gateway",
        model: unconfigured ? "existing-direct-model" : names[0],
        credentialConfigured: !unconfigured,
        selectedRouteIds: routes.length ? [routes[0].id] : [],
        selectedModelAliases: routes.length ? [names[0]] : [],
        defaultRouteId: routes[0]?.id, catalogStatus: unconfigured ? "none" : "managed",
        catalogSync: { state: unconfigured ? "not-applied" : "current", source: unconfigured ? "none" : "gateway", models: [] },
        ...(unconfigured ? { direct: { kind: "official", name: "官方默认", profileId: "official", importable: false } } : {}),
      };
      let preferences = {
        revision: "fixture-draft", exists: !unconfigured, routeIds: routes.length ? [routes[0].id] : [],
        defaultRouteId: routes[0]?.id || "", credentialSource: "current",
      };
      window.fixtureWrites = [];
      const library = {
        revision: "fixture-profiles", secureStorageAvailable: true,
        lastDirectProfileId: "official",
        profiles: [{ id: "official", kind: "official", name: "官方默认", models: [], credentialConfigured: false, editable: false, active: false }],
      };
      window.desktopControls = {
        getWorkspace: async () => ({
          settings: { gatewayHost: "127.0.0.1", gatewayPort: 18542, usageRetentionCount: 1000 },
          upstreams: [{ id: "fixture-upstream", name: "隔离浏览器验证", baseUrl: "https://fixture.invalid/v1", enabled: true, models: names }],
          routes, usage: [], clientKeys: [],
        }),
        getCodexStatus: async () => status,
        getCodexGatewayPreferences: async () => preferences,
        saveCodexGatewayPreferences: async (input) => (preferences = { ...input, exists: true, revision: "fixture-saved" }),
        getCodexGatewayCredentials: async () => ({ credentials: [], currentConfigured: true }),
        retainCodexGatewayCredential: async () => ({ credentials: [], currentConfigured: true }),
        getCodexDirectProfiles: async () => library,
        saveCodexDirectProfile: async () => library,
        importCodexDirectProfile: async () => library,
        duplicateCodexDirectProfile: async () => library,
        deleteCodexDirectProfile: async () => library,
        getCodexClientStatus: async () => ({ available: true, login: "idle", auth: "unknown" }),
        startCodexLogin: async () => ({ available: true, login: "idle", auth: "unknown" }),
        cancelCodexLogin: async () => ({ available: true, login: "idle", auth: "unknown" }),
        previewCodexConfig: async (input) => ({
          ...status, mode: input.mode, providerName: input.mode === "gateway" ? "CX-RG 网关" : "官方默认",
          selectedModelAliases: (input.routeIds || []).map((id) => routes.find((route) => route.id === id)?.alias).filter(Boolean),
          configPreview: "# Isolated in-memory browser fixture only", changes: [],
        }),
        applyCodexConfig: async (input) => {
          window.fixtureWrites.push(input);
          status = {
            ...status,
            mode: input.mode,
            revision: "fixture-after",
            configured: true,
            selectedRouteIds: input.routeIds || [],
            selectedModelAliases: (input.routeIds || []).map((id) => routes.find((route) => route.id === id)?.alias).filter(Boolean),
            defaultRouteId: input.defaultRouteId,
            direct: input.mode === "direct" ? status.direct : undefined,
          };
          return status;
        },
        restoreCodexConfig: async () => status,
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.CXRG_PREVIEW_URL || "http://127.0.0.1:18541/#/codex");
    const gateway = page.getByRole("tab", { name: /CX-RG 网关/ });
    await page.getByRole("checkbox", { name: "选择 gpt-6.1-sol" }).waitFor();
    await gateway.focus();
    await page.keyboard.press("Home");
    assert.equal(await page.getByRole("tab", { name: /Codex 直连/ }).evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("End");
    assert.equal(await gateway.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Home");
    await page.keyboard.press("Space");
    assert.match(await gateway.innerText(), /生效中/);
    assert.equal(await page.getByRole("button", { name: "切换到 Codex 直连", exact: true }).count(), 1);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0);
    await page.getByRole("button", { name: "切换到 Codex 直连", exact: true }).click();
    const directDialog = page.getByRole("dialog", { name: "确认启用 Codex 直连" });
    await directDialog.waitFor();
    assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0);
    await page.keyboard.press("Escape");
    await directDialog.waitFor({ state: "hidden" });
    assert.match(await gateway.innerText(), /生效中/);
    await gateway.click();
    assert.equal(await page.getByRole("button", { name: "Gateway 已启用", exact: true }).isDisabled(), true);
    await page.getByRole("checkbox", { name: "选择 claude-opus-5-5" }).check();
    const reapply = page.getByRole("button", { name: "保存并重新应用", exact: true });
    assert.equal(await reapply.isEnabled(), true);
    await reapply.click();
    const gatewayDialog = page.getByRole("dialog", { name: "确认保存并启用网关" });
    await gatewayDialog.waitFor();
    await gatewayDialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "保存并重新应用", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "保存并重新应用", exact: true }).click();
    await page.getByRole("dialog", { name: "确认保存并启用网关" }).waitFor();
    await page.getByRole("dialog", { name: "确认保存并启用网关" }).getByRole("button", { name: "确认启用", exact: true }).click();
    await page.getByText(/网关配置已保存并启用/).waitFor();
    assert.equal(await page.evaluate(() => window.fixtureWrites.length), 1);
    assert.equal(await page.getByRole("button", { name: "Gateway 已启用", exact: true }).isDisabled(), true);
    const filter = page.getByRole("group", { name: "Codex 模型分类" });
    await filter.getByRole("button", { name: "claude 1", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "选择 gpt-6.1-sol" }).count(), 0);
    await page.getByRole("checkbox", { name: "选择 claude-opus-5-5" }).check();
    await filter.getByRole("button", { name: "全部 7", exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "选择 gpt-6.1-sol" }).isChecked(), true);
    assert.equal(await page.getByRole("checkbox", { name: "选择 claude-opus-5-5" }).isChecked(), true);
    const layouts = [];
    for (const width of [1530, 1024, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.getByRole("heading", { name: "Codex", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, `state-aware-mode-${width}.png`), fullPage: false });
      await filter.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, `state-aware-viewport-${width}.png`), fullPage: false });
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        modelRowsFit: [...document.querySelectorAll(".codex-model-row")].every((row) => {
          const bottom = row.getBoundingClientRect().bottom;
          return [...row.children].every((child) => child.getBoundingClientRect().bottom <= bottom + 1);
        }),
      }));
      assert.ok(layout.documentWidth <= layout.viewport, `Horizontal overflow at ${width}: ${layout.documentWidth}`);
      assert.ok(layout.modelRowsFit, `Model descriptions overlap following rows at ${width}`);
      layouts.push(layout);
    }
    assert.deepEqual(errors, []);
    const emptyPage = await context.newPage();
    await emptyPage.goto((process.env.CXRG_PREVIEW_URL || "http://127.0.0.1:18541/#/codex").replace("#/codex", "?empty=1#/codex"));
    await emptyPage.getByRole("tab", { name: /Codex 直连/ }).waitFor();
    await emptyPage.getByRole("tab", { name: /CX-RG 网关/ }).click();
    const setupAction = emptyPage.getByRole("button", { name: "去配置模型路由", exact: true });
    await setupAction.waitFor();
    assert.equal(await setupAction.isEnabled(), true);
    assert.equal(await emptyPage.getByRole("dialog").count(), 0);
    assert.equal(await emptyPage.evaluate(() => window.fixtureWrites.length), 0);
    await setupAction.click();
    await emptyPage.waitForURL(/#\/routes$/);
    assert.equal(await emptyPage.evaluate(() => window.fixtureWrites.length), 0);
    await fs.writeFile(path.join(__dirname, "state-aware-browser-result.json"), JSON.stringify({
      status: "PASS", environment: "Isolated browser; in-memory Desktop bridge fixture; not a native/provider check",
      checks: ["tabs select target mode only", "explicit header action previews modes", "incomplete Gateway guides to routing without preview", "unchanged active mode action disabled", "changed active Gateway requires re-apply", "cancel preserves draft", "confirm applies once", "truthful active badge", "family filter", "hidden selections preserved", "no horizontal overflow", "no page errors"], layouts,
    }, null, 2) + "\n");
    console.log("PASS: isolated browser mode/filter and 1530/1024/390 viewport checks");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
