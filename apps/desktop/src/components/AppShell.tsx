import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { WindowTitleBar } from "./WindowTitleBar";
import { NavigationIcon } from "./NavigationIcon";
import { RuntimeIndicator } from "./RuntimeIndicator";
import { destinations, navigationGroups } from "./navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const previousLocation = useRef(location.key);
  const current = destinations.find(({ to }) => to === location.pathname);

  useEffect(() => {
    if (previousLocation.current === location.key) return;
    previousLocation.current = location.key;
    setNavigationOpen(false);
    if (mainRef.current) { mainRef.current.inert = false; mainRef.current.scrollTop = 0; mainRef.current.focus(); }
  }, [location.key]);

  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 1101px)");
    const close = () => {
      if (!query?.matches) return;
      setNavigationOpen(false);
      if (mainRef.current) { mainRef.current.inert = false; mainRef.current.focus(); }
    };
    query?.addEventListener("change", close);
    return () => query?.removeEventListener("change", close);
  }, []);

  useEffect(() => {
    if (!navigationOpen) return;
    const main = mainRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.inert = true;
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    (links.find(link => link.getAttribute("aria-current") === "page") ?? links[0])?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavigationOpen(false);
        menuRef.current?.focus();
      } else if (event.key === "Tab" && links.length) {
        const first = links[0], last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      if (main) main.inert = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [navigationOpen]);

  function navigate() {
    setNavigationOpen(false);
    if (mainRef.current) { mainRef.current.inert = false; mainRef.current.scrollTop = 0; mainRef.current.focus(); }
  }

  return <>
    <WindowTitleBar />
    <div className="app-frame">
      <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); mainRef.current?.focus(); }}>跳到主要内容</a>
      {navigationOpen && <div className="navigation-backdrop" aria-hidden="true" onClick={() => { setNavigationOpen(false); menuRef.current?.focus(); }} />}
      <aside className={`sidebar${navigationOpen ? " is-open" : ""}`}>
        <nav ref={navRef} id="primary-navigation" aria-label="主导航" className="primary-nav">
          {navigationGroups.map(group => <div className={`nav-group${group === "偏好设置" ? " nav-group-footer" : ""}`} role="group" aria-label={group} key={group}>
            {group !== "偏好设置" && <p className="nav-group-label" aria-hidden="true">{group}</p>}
            {destinations.filter(item => item.group === group).map(({ label, to, icon }) => <NavLink key={to} to={to} end onClick={navigate} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
              <NavigationIcon name={icon} /><span>{label}</span>
            </NavLink>)}
          </div>)}
        </nav>
        <p className="sidebar-footnote">本机工作区</p>
      </aside>
      <section className="workspace-column">
        <header className="topbar">
          <button ref={menuRef} className="menu-toggle" type="button" aria-label={navigationOpen ? "关闭导航" : "打开导航"} aria-expanded={navigationOpen} aria-controls="primary-navigation" onClick={() => setNavigationOpen(open => !open)}>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
          <nav className="workspace-context" aria-label="当前位置">
            <span className="workspace-context-root">本机工作区</span>
            {current && <><span className="context-chevron" aria-hidden="true" /><span className="workspace-context-group">{current.group}</span></>}
            <span className="context-chevron" aria-hidden="true" />
            <span className="workspace-context-page" aria-current="page">{current?.label ?? "页面不存在"}</span>
          </nav>
          <RuntimeIndicator />
        </header>
        <main ref={mainRef} id="main-content" className="work-surface" tabIndex={-1}>{children}</main>
      </section>
    </div>
  </>;
}
