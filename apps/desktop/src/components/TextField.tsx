import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  hint?: ReactNode;
};

export function TextField({ label, hint, id, className = "", ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const describedBy = [props["aria-describedby"], hintId].filter(Boolean).join(" ");
  return (
    <div className="geist-field">
      {label && <label className="geist-field-label" htmlFor={inputId}>{label}</label>}
      <input {...props} id={inputId} className={`geist-input ${className}`.trim()} aria-describedby={describedBy || undefined} />
      {hint && <span className="geist-field-hint" id={hintId}>{hint}</span>}
    </div>
  );
}
