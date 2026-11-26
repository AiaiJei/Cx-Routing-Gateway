import { NavigationIcon } from "./NavigationIcon";
import type { NavigationIconName } from "./NavigationIcon";

type OverviewIconName = NavigationIconName | "gateway" | "outcomes" | "duration";

export function OverviewIcon({ name, size = 48 }: { name: OverviewIconName; size?: 40 | 48 }) {
  return (
    <span className="overview-icon" data-size={size} aria-hidden="true">
      {name === "gateway" || name === "outcomes" || name === "duration" ? (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {name === "gateway" && <><circle cx="10" cy="10" r="2.5" /><circle cx="4" cy="4" r="1.3" /><circle cx="16" cy="4" r="1.3" /><circle cx="4" cy="16" r="1.3" /><circle cx="16" cy="16" r="1.3" /><path d="m8.2 8.2-3-3m6.6 3 3-3m-6.6 6.6-3 3m6.6-3 3 3" /></>}
          {name === "outcomes" && <><circle cx="10" cy="10" r="7" /><path d="m6.5 10 2.3 2.3 4.7-4.6" /></>}
          {name === "duration" && <><circle cx="10" cy="11" r="6.5" /><path d="M8 1.5h4M10 1.5v3M15 5.5l1.5-1.5M10 7.5V11l2 1" /></>}
        </svg>
      ) : <NavigationIcon name={name} />}
    </span>
  );
}
