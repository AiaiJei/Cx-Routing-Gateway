import { useRef, type KeyboardEvent } from "react";
import type { CodexMode, CodexStatus } from "../domain/codex-management";
export type CodexTab = CodexMode;
export function CodexTabs({
  value,
  activeMode,
  onChange,
  disabled = false,
}: {
  value: CodexTab | null;
  activeMode?: CodexStatus["mode"];
  onChange: (tab: CodexTab) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = [
    { id: "direct" as const, label: "Codex 直连" },
    { id: "gateway" as const, label: "CX-RG 网关" },
  ];
  function key(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft")
      next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Codex 接入方式" className="codex-tabs">
      {tabs.map((tab, index) => (
        <button
          type="button"
          key={tab.id}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          role="tab"
          id={"codex-tab-" + tab.id}
          aria-selected={value === tab.id}
          aria-controls={"codex-panel-" + tab.id}
          tabIndex={value === tab.id || (!value && index === 0) ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => key(event, index)}
        >
          {tab.label}
          {activeMode === tab.id && (
            <span className="codex-active-badge">生效中</span>
          )}
        </button>
      ))}
    </div>
  );
}
