import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type SelectOption = string | { value: string; label: string };

function normalizeOption(option: SelectOption) {
  return typeof option === "string" ? { value: option, label: option } : option;
}

export function CustomSelect({
  ariaLabel,
  name,
  value,
  options,
  onChange,
  placeholder = "请选择",
}: {
  ariaLabel: string;
  name?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex((option) => normalizeOption(option).value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedOptions = options.map(normalizeOption);
  const selected = normalizedOptions.find((option) => option.value === value);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function openMenu() {
    setActiveIndex(Math.max(0, normalizedOptions.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = normalizedOptions[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + normalizedOptions.length) % normalizedOptions.length);
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <div className="custom-select" ref={rootRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <button className="custom-select-trigger" type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${name ?? ariaLabel}-options`} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={handleKeyDown}>
        <span className={selected ? "" : "custom-select-placeholder"}>{selected?.label ?? placeholder}</span>
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="custom-select-menu" id={`${name ?? ariaLabel}-options`} role="listbox" aria-label={ariaLabel}>
        {normalizedOptions.map((option, index) => <button className={`custom-select-option${option.value === value ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`} key={option.value} type="button" role="option" aria-selected={option.value === value} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)}>{option.label}</button>)}
      </div>}
    </div>
  );
}
