type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  const visible = Boolean(message);
  return (
    <div className={`toast${visible ? " is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!visible}>
      {message ?? ""}
    </div>
  );
}
