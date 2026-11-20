function installTrayLifecycle({ app, BrowserWindow, Tray, Menu, iconPath, shouldQuit = () => false }) {
  const tray = new Tray(iconPath);
  const attachedWindows = new WeakSet();

  function showMainWindow() {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return false;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return true;
  }

  tray.setToolTip("Cx-Routing Gateway");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开主界面", click: showMainWindow },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));
  tray.on("click", showMainWindow);

  return {
    attachWindow(window) {
      if (attachedWindows.has(window)) return;
      attachedWindows.add(window);
      window.on("close", (event) => {
        if (shouldQuit()) return;
        event.preventDefault();
        window.hide();
      });
    },
    showMainWindow,
  };
}

function registerSecondInstanceHandler({ app, showMainWindow }) {
  app.on("second-instance", () => showMainWindow());
}

function registerActivateHandler({ app, showMainWindow, createWindow }) {
  app.on("activate", () => {
    if (!showMainWindow()) createWindow();
  });
}

module.exports = { installTrayLifecycle, registerActivateHandler, registerSecondInstanceHandler };
