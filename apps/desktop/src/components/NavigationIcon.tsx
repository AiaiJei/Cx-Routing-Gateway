import type { ReactNode } from "react";

export type NavigationIconName = "overview" | "upstreams" | "routes" | "logs" | "credentials" | "settings";

const icons: Record<NavigationIconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="6" height="6" rx="1.2" /><rect x="11" y="3" width="6" height="6" rx="1.2" /><rect x="3" y="11" width="6" height="6" rx="1.2" /><rect x="11" y="11" width="6" height="6" rx="1.2" /></>,
  upstreams: <><rect x="3" y="3.5" width="14" height="5" rx="1.3" /><rect x="3" y="11.5" width="14" height="5" rx="1.3" /><path d="M6 6h.01M6 14h.01M9 6h5M9 14h5" /></>,
  routes: <><circle cx="4" cy="5" r="1.5" /><circle cx="16" cy="15" r="1.5" /><path d="M5.5 5H12a3 3 0 0 1 3 3v4M14.5 15H8a3 3 0 0 1-3-3V8" /><path d="m12.5 10 2.5 2 2.5-2" /></>,
  logs: <><path d="M7 4.5h10M7 9.5h10M7 14.5h10" /><circle cx="4" cy="4.5" r=".6" /><circle cx="4" cy="9.5" r=".6" /><circle cx="4" cy="14.5" r=".6" /></>,
  credentials: <><circle cx="7" cy="8" r="3.5" /><path d="m9.5 10.5 6.2 6.2M13 14l2-2M15 16l2-2" /></>,
  settings: <><path d="M10 3.2v1.4M10 15.4v1.4M16.8 10h-1.4M4.6 10H3.2m11.6-4.8-1 1m-7.6 7.6-1 1m9.6 0-1-1m-7.6-7.6-1-1" /><path d="M12.9 4.1a6.5 6.5 0 0 1 3 3l1.3.5v4.8l-1.3.5a6.5 6.5 0 0 1-3 3l-.5 1.3H7.6l-.5-1.3a6.5 6.5 0 0 1-3-3l-1.3-.5V7.6l1.3-.5a6.5 6.5 0 0 1 3-3l.5-1.3h4.8z" /><circle cx="10" cy="10" r="2.2" /></>,
};

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icons[name]}
    </svg>
  );
}
