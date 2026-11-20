import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { installTrayLifecycle } = require("../../apps/desktop/electron/tray-lifecycle.cjs");

class FakeWindow extends EventEmitter {
  constructor() {
    super();
    this.minimized = false;
    this.visible = true;
    this.calls = [];
  }

  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; this.calls.push("restore"); }
  show() { this.visible = true; this.calls.push("show"); }
  hide() { this.visible = false; this.calls.push("hide"); }
  focus() { this.calls.push("focus"); }
}

function createHarness() {
  const windows = [];
  const trays = [];
  let quitting = false;
  const app = { quitCalls: 0, quit() { this.quitCalls += 1; } };
  class Tray extends EventEmitter {
    constructor(iconPath) {
      super();
      this.iconPath = iconPath;
      this.contextMenu = null;
      trays.push(this);
    }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.contextMenu = value; }
  }
  const Menu = { buildFromTemplate: (template) => template };
  const BrowserWindow = { getAllWindows: () => windows };
  const lifecycle = installTrayLifecycle({
    app,
    BrowserWindow,
    Tray,
    Menu,
    iconPath: "product.ico",
    shouldQuit: () => quitting,
  });

  return { app, lifecycle, setQuitting: (value) => { quitting = value; }, trays, windows };
}

test("closing the window hides it without allowing Electron to close it", () => {
  const { lifecycle } = createHarness();
  const window = new FakeWindow();
  lifecycle.attachWindow(window);
  let prevented = false;

  window.emit("close", { preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(window.visible, false);
  assert.deepEqual(window.calls, ["hide"]);
});

test("closing during application quit is allowed", () => {
  const { lifecycle, setQuitting } = createHarness();
  setQuitting(true);
  const window = new FakeWindow();
  lifecycle.attachWindow(window);
  let prevented = false;

  window.emit("close", { preventDefault() { prevented = true; } });

  assert.equal(prevented, false);
  assert.deepEqual(window.calls, []);
});

test("tray click restores, shows, and focuses the existing window", () => {
  const { lifecycle, trays, windows } = createHarness();
  const window = new FakeWindow();
  window.minimized = true;
  window.visible = false;
  windows.push(window);
  lifecycle.attachWindow(window);

  trays[0].emit("click");

  assert.equal(window.visible, true);
  assert.deepEqual(window.calls, ["restore", "show", "focus"]);
  assert.equal(windows.length, 1);
});

test("tray Open shows and focuses a hidden window", () => {
  const { lifecycle, trays, windows } = createHarness();
  const window = new FakeWindow();
  window.visible = false;
  windows.push(window);
  lifecycle.attachWindow(window);

  const openItem = trays[0].contextMenu.find((item) => item.label === "打开主界面");
  openItem.click();

  assert.equal(window.visible, true);
  assert.deepEqual(window.calls, ["show", "focus"]);
});

test("tray Exit requests a full app quit", () => {
  const { app, trays } = createHarness();
  const exitItem = trays[0].contextMenu.find((item) => item.label === "退出");

  exitItem.click();

  assert.equal(app.quitCalls, 1);
});

test("one tray serves multiple windows and attach is idempotent", () => {
  const { lifecycle, trays } = createHarness();
  const first = new FakeWindow();
  const second = new FakeWindow();
  lifecycle.attachWindow(first);
  lifecycle.attachWindow(first);
  lifecycle.attachWindow(second);

  first.emit("close", { preventDefault() {} });
  second.emit("close", { preventDefault() {} });

  assert.equal(trays.length, 1);
  assert.deepEqual(first.calls, ["hide"]);
  assert.deepEqual(second.calls, ["hide"]);
});
