import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger";

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: Variant;
};

export function UIButton({ children, variant = "secondary", className = "", ...rest }: Props) {
  const base = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-secondary";
  return <button className={`${base} ${className}`.trim()} {...rest}>{children}</button>;
}

