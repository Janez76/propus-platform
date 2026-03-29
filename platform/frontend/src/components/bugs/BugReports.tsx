import type { BugReport } from "../../api/bugs";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  bugs: BugReport[];
  onStatus: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onMail: (id: number) => void;
};

export function BugReports({ bugs, onStatus, onDelete, onMail }: Props) {
  const language = useAuthStore((s) => s.language);

  return (
    <div className="overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">{t(language, "bugs.table.title")}</th>
            <th className="px-3 py-2">{t(language, "bugs.table.status")}</th>
            <th className="px-3 py-2">{t(language, "bugs.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((b) => (
            <tr key={b.id} className="border-t border-zinc-100">
              <td className="px-3 py-2">
                <div className="font-semibold">{b.title}</div>
                <div className="text-xs text-zinc-500">{b.description || ""}</div>
              </td>
              <td className="px-3 py-2">
                <select id={`bug-status-${b.id}`} name={`bug_status_${b.id}`} className="rounded border px-2 py-1 text-xs" value={b.status} onChange={(e) => onStatus(b.id, e.target.value)}>
                  {['new','open','resolved','closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => onMail(b.id)}>
                    {t(language, "bugs.button.email")}
                  </button>
                  <button className="rounded border px-2 py-1 text-xs text-red-700" onClick={() => onDelete(b.id)}>
                    {t(language, "common.delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
