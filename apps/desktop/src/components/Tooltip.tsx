import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Read-only disclosure, available to pointer, keyboard and touch users. */
export function Tooltip({ label, content, children, className = "" }: { label: string; content: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const cancelClose = () => clearTimeout(timer.current);
  const close = () => { cancelClose(); pinned.current = false; if (panel.current?.contains(document.activeElement)) trigger.current?.focus(); setOpen(false); };
  const leave = () => {
    if (!pinned.current && document.activeElement !== trigger.current) timer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = panel.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8));
      const top = anchor.bottom + box.height + 8 <= window.innerHeight ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6);
      setPosition({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("scroll", scroll, true); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className={`detail-trigger ${className}`} aria-label={label} aria-describedby={open ? id : undefined}
      onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={leave}
      onFocus={() => { cancelClose(); setOpen(true); }} onBlur={(event) => { if (!panel.current?.contains(event.relatedTarget)) close(); }}
      onClick={() => { if (pinned.current) close(); else { cancelClose(); pinned.current = true; setOpen(true); } }}>
      {children}
    </button>
    {open && createPortal(<div ref={panel} id={id} role="tooltip" tabIndex={-1} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); }} className="detail-tooltip" style={position} onMouseEnter={cancelClose} onMouseLeave={leave}>
      {content}
    </div>, document.body)}
  </>;
}
