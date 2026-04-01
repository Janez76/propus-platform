import { useState } from "react";

const steps = [
  { id: 1, title: "Standort & Objekt", desc: "Adresse und Karte" },
  { id: 2, title: "Leistungen", desc: "Pakete und Add-ons" },
  { id: 3, title: "Fotograf & Termin", desc: "Auswahl und Kalender" },
  { id: 4, title: "Rechnung", desc: "Übersicht und Abschluss" },
];

/**
 * Platzhalter-Seite für den Buchungs-Wizard im alten admin-panel-Tree.
 * Produktiv: Wizard in `app/` (Next.js) unter `/` (öffentlicher Host) bzw. `/book`.
 */
export function BookingWizardPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur border-[var(--border-soft)] bg-[var(--surface)]/80">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-xl font-semibold text-[var(--text-main)]">Propus Buchung</h1>
          <div className="flex gap-2">
            {steps.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  step === s.id
                    ? "bg-[var(--accent)] text-white"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 bg-[var(--surface-raised)] text-[var(--text-main)]"
                }`}
              >
                {s.id}. {s.title}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">{steps[step - 1].title}</h2>
          <p className="mt-1 text-sm text-[var(--text-subtle)]">{steps[step - 1].desc}</p>
          <p className="mt-6 text-sm text-zinc-500">
            Die Buchung läuft über die Next.js-App im <code className="rounded bg-zinc-100 px-1 bg-[var(--surface)]">app/</code>
            -Projekt (öffentlich <code className="rounded bg-zinc-100 px-1 bg-[var(--surface)]">/</code>, Admin-Host{" "}
            <code className="rounded bg-zinc-100 px-1 bg-[var(--surface)]">/book</code>).
          </p>
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              disabled={step <= 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-40 border-[var(--border-soft)]"
            >
              Zurück
            </button>
            <button
              type="button"
              disabled={step >= 4}
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Weiter
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}


