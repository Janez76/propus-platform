const PICDROP_URL = "https://bildauswahl.propus.ch";

export function PicdropPage() {
  return (
    <iframe
      src={PICDROP_URL}
      title="Picdrop"
      allow="clipboard-write"
      style={{ width: "100%", flex: 1, border: "none", display: "block", minHeight: 0, height: "100%" }}
      className="h-full w-full"
    />
  );
}
