const picdropUrl = (process.env.NEXT_PUBLIC_PICDROP_URL as string | undefined)?.trim() ?? "";

export function PicdropPage() {
  if (!picdropUrl) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-subtle)]">
        <p>
          <strong>NEXT_PUBLIC_PICDROP_URL</strong> ist nicht konfiguriert.
          <br />
          Bitte den Wert in der <code>.env</code>-Datei der App setzen.
        </p>
      </div>
    );
  }

  return (
    <iframe
      src={picdropUrl}
      title="Selekto"
      allow="clipboard-write"
      style={{ width: "100%", flex: 1, border: "none", display: "block", minHeight: 0, height: "100%" }}
      className="h-full w-full"
    />
  );
}
