import { useEffect, useState } from "react";
import { addAbsenceEvent, deleteAbsenceEvent, getPhotographerSettings } from "../../api/photographers";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = { token: string; employeeKey: string; employeeEmail?: string };

type KnownAbsence = {
  id: string;
  label: string;
  eventId?: string;
};

function asDateInputValue(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function blockedToKnown(blocked: Array<Record<string, unknown>>): KnownAbsence[] {
  return blocked.map((b, idx) => {
    const from = asDateInputValue(String(b.von || ""));
    const to = asDateInputValue(String(b.bis || "")) || from;
    const g = String(b.grund || "Abwesend");
    const eid = typeof b.id === "string" ? b.id : undefined;
    return {
      id: eid || `${from}-${to}-${idx}`,
      label: `${from} - ${to} (${g})`,
      eventId: eid,
    };
  });
}

export function AbsenceCalendar({ token, employeeKey, employeeEmail }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [vonTime, setVonTime] = useState("08:00");
  const [bisTime, setBisTime] = useState("17:00");
  const [grund, setGrund] = useState("Privat");
  const [notiz, setNotiz] = useState("");
  const [known, setKnown] = useState<KnownAbsence[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getPhotographerSettings(token, employeeKey)
      .then((settings) => {
        const blocked = Array.isArray(settings.blocked_dates) ? settings.blocked_dates : [];
        setKnown(blockedToKnown(blocked as Array<Record<string, unknown>>));
      })
      .catch(() => {});
  }, [token, employeeKey]);

  async function saveAbsence() {
    if (!von || !bis) {
      setStatus(t(lang, "absence.error.datesRequired"));
      return;
    }
    setBusy("save");
    setStatus("");
    try {
      await addAbsenceEvent(token, employeeKey, {
        von,
        bis,
        ganztaegig: allDay,
        vonTime,
        bisTime,
        grund,
        notiz,
        photographerEmail: employeeEmail,
      });
      const settings = await getPhotographerSettings(token, employeeKey);
      const blocked = Array.isArray(settings.blocked_dates) ? settings.blocked_dates : [];
      setKnown(blockedToKnown(blocked as Array<Record<string, unknown>>));
      setNotiz("");
      setStatus(t(lang, "absence.success.saved"));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t(lang, "absence.error.saveFailed"));
    } finally {
      setBusy("");
    }
  }

  async function removeAbsence(item: KnownAbsence) {
    if (!item.eventId) {
      setStatus(t(lang, "absence.error.cannotDeleteHere"));
      return;
    }
    setBusy("delete");
    setStatus("");
    try {
      await deleteAbsenceEvent(token, employeeKey, item.eventId, employeeEmail);
      setKnown((prev) => prev.filter((row) => row.id !== item.id));
      setStatus(t(lang, "absence.success.deleted"));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t(lang, "absence.error.deleteFailed"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={uiMode === "modern" ? "surface-card p-4" : "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"}>
      <h3 className="mb-3 text-sm font-bold">{t(lang, "absence.title").replace("{{key}}", employeeKey)}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="absVon" className="mb-1 block text-sm">{t(lang, "absence.label.from")}</label>
          <input id="absVon" name="absVon" type="date" className="ui-input" value={von} onChange={(e) => setVon(e.target.value)} />
        </div>
        <div>
          <label htmlFor="absBis" className="mb-1 block text-sm">{t(lang, "absence.label.to")}</label>
          <input id="absBis" name="absBis" type="date" className="ui-input" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
      </div>

      <label className="mt-2 inline-flex items-center gap-2 text-sm">
        <input id="absGanztaegig" name="absGanztaegig" type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        {t(lang, "absence.label.allDay")}
      </label>

      {!allDay ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="absVonTime" className="mb-1 block text-sm">{t(lang, "absence.label.fromTime")}</label>
            <input id="absVonTime" name="absVonTime" type="time" className="ui-input" value={vonTime} onChange={(e) => setVonTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="absBisTime" className="mb-1 block text-sm">{t(lang, "absence.label.toTime")}</label>
            <input id="absBisTime" name="absBisTime" type="time" className="ui-input" value={bisTime} onChange={(e) => setBisTime(e.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="absGrund" className="mb-1 block text-sm">{t(lang, "absence.label.reason")}</label>
          <input id="absGrund" name="absGrund" className="ui-input" value={grund} onChange={(e) => setGrund(e.target.value)} />
        </div>
        <div>
          <label htmlFor="absNotiz" className="mb-1 block text-sm">{t(lang, "absence.label.note")}</label>
          <input id="absNotiz" name="absNotiz" className="ui-input" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
      </div>

      <button className={`mt-3 ${uiMode === "modern" ? "btn-primary" : "rounded border px-3 py-2 text-sm"}`} onClick={saveAbsence} disabled={Boolean(busy)}>
        {busy === "save" ? t(lang, "absence.button.saving") : t(lang, "absence.button.save")}
      </button>

      <div className="mt-3 max-h-48 overflow-auto rounded border border-zinc-200 p-2 text-xs">
        {!known.length ? <div className="text-zinc-500">{t(lang, "absence.empty")}</div> : null}
        {known.map((entry) => (
          <div key={entry.id} className="mb-1 flex items-center justify-between gap-2 last:mb-0">
            <span>{entry.label}</span>
            <button className={uiMode === "modern" ? "btn-secondary" : "rounded border px-2 py-1"} disabled={Boolean(busy)} onClick={() => removeAbsence(entry)}>
              {t(lang, "common.delete")}
            </button>
          </div>
        ))}
      </div>

      {status ? <p className="mt-2 text-sm text-zinc-700">{status}</p> : null}
    </div>
  );
}

