import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type SelectProps = { ariaLabel: string; name?: string; options: (string | { value: string; label: string })[]; placeholder?: string } & (
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
);

export function CustomSelect(props: SelectProps) {
  const { ariaLabel, name, placeholder = "请选择" } = props;
  const options = props.options.map(item => typeof item === "string" ? { value: item, label: item } : item);
  const values = props.multiple ? props.value : [props.value];
  const selected = options.filter(option => values.includes(option.value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [id, active, open]);
  function show() {
    setActive(Math.max(0, options.findIndex(option => values.includes(option.value))));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (props.multiple) {
      props.onChange(values.includes(option.value) ? values.filter(item => item !== option.value) : [...values, option.value]);
    } else {
      props.onChange(option.value);
      setOpen(false);
    }
  }
  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (open && event.key === "Escape") {
      event.stopPropagation(); event.preventDefault(); setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else if (options.length) setActive((active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); choose(active);
    }
  }
  return <div className={`custom-select${props.multiple ? " custom-select-multiple" : ""}`} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {name && values.map(value => <input key={value} type="hidden" name={name} value={value} />)}
    <button className="custom-select-trigger" type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={handleKey}>
      <span className={selected.length ? "select-summary" : "custom-select-placeholder"}>{selected.length > 1 ? `已选 ${selected.length} 个模型` : selected[0]?.label ?? placeholder}</span>
      <svg className="select-indicator" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div id={id} className="custom-select-menu" role="listbox" aria-label={ariaLabel} aria-multiselectable={props.multiple || undefined}>
      {options.map((option, index) => <button id={`${id}-${index}`} key={option.value} type="button" role="option" tabIndex={-1} aria-selected={values.includes(option.value)} className={`custom-select-option${active === index ? " is-active" : ""}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" className="select-option-check" style={{ visibility: values.includes(option.value) ? "visible" : "hidden" }}><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>)}
      {!options.length && <span className="helper-text">暂无模型，请先测试上游连接</span>}
    </div>}
  </div>;
}
