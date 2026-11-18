import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { WindowTitleBar } from "./WindowTitleBar";

const destinations = [
  { label: "总览", to: "/", end: true },
  { label: "上游服务", to: "/upstreams" },
  { label: "模型路由", to: "/routes" },
  { label: "调用日志", to: "/logs" },
  { label: "接入凭证", to: "/credentials" },
  { label: "设置", to: "/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  return (
    <>
      <WindowTitleBar />
      <div className="app-frame">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className={`sidebar${navigationOpen ? " is-open" : ""}`}>
        <NavLink className="brand" to="/" onClick={() => setNavigationOpen(false)}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Cx-Routing Gateway</span>
        </NavLink>
        <nav id="primary-navigation" aria-label="主导航" className="primary-nav">
          {destinations.map(({ label, to, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-footnote">本机工作区</p>
      </aside>
      <section className="workspace-column">
        <header className="topbar">
          <button
            className="menu-toggle"
            type="button"
            aria-label={navigationOpen ? "关闭导航" : "打开导航"}
            aria-expanded={navigationOpen}
            aria-controls="primary-navigation"
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <span className="topbar-title">Cx-Routing Gateway</span>
          <span className="runtime-state"><span className="state-dot" />运行时未接入</span>
        </header>
        <main id="main-content" className="work-surface" tabIndex={-1}>
          {children}
        </main>
      </section>
      </div>
    </>
  );
}
