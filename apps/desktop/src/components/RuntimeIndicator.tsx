import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  preview: "浏览器预览", checking: "正在检查 Gateway", running: "Gateway 运行中",
  starting: "Gateway 启动中", stopping: "Gateway 停止中", stopped: "Gateway 已停止",
  failed: "Gateway 运行异常", unknown: "无法获取 Gateway 状态",
};

export function RuntimeIndicator() {
  const read = window.desktopControls?.getStatus;
  const [state, setState] = useState(read ? "checking" : "preview");
  useEffect(() => {
    if (!read) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await read!();
        if (active) setState(Object.hasOwn(labels, result.state) ? result.state : "unknown");
      } catch { if (active) setState("unknown"); }
      if (active) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [read]);
  return <span className="runtime-state" data-state={state} role="status"><span aria-hidden="true" className="state-dot" />{labels[state]}</span>;
}
