import { useState } from "react";

export function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false);

  function toggleMaximize() {
    const result = window.desktopControls?.toggleMaximize();
    if (result instanceof Promise) {
      void result.then(setMaximized);
    } else {
      setMaximized((current) => !current);
    }
  }

  return (
    <header className="window-titlebar" aria-label="窗口标题栏" onDoubleClick={toggleMaximize}>
      <div className="window-titlebar-brand">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span data-testid="window-title" data-window-title="true">Cx-Routing Gateway</span>
      </div>
      <div className="window-controls" aria-label="窗口控制">
        <button type="button" aria-label="最小化窗口" onClick={() => window.desktopControls?.minimize()}>−</button>
        <button type="button" aria-label={maximized ? "还原窗口" : "最大化窗口"} onClick={toggleMaximize}>{maximized ? "❐" : "□"}</button>
        <button className="window-close" type="button" aria-label="关闭窗口" onClick={() => window.desktopControls?.close()}>×</button>
      </div>
    </header>
  );
}
