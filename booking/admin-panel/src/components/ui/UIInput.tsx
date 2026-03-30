import type { InputHTMLAttributes } from "react";

export function UIInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${props.className || ""}`.trim()} />;
}

