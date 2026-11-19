import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "accent" | "danger";
type ButtonSize = "default" | "small" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "secondary", size = "default", className = "", type = "button", ...props }: ButtonProps) {
  const classes = ["geist-button", `geist-button--${variant}`, `geist-button--${size}`, className].filter(Boolean).join(" ");
  return <button {...props} className={classes} type={type} />;
}
