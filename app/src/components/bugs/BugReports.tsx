import { Bug, Trash2 } from "lucide-react";
import type { BugReport } from "../../api/bugs";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  bugs: BugReport[];
  /** Wenn false: nur Anzeige, keine Status-/Mail-/Lösch-Aktionen */
  canManage?: boolean;
  onStatus: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onMail: (id: number) => void;
};

const BUG_STATUS_MAP: Record<string, string> = {
  new: "cust-status-badge cust-status-pending",
  open: "cust-status-badge cust-status-open",
  resolved: "cust-status-badge cust-status-completed",
  closed: "cust-status-badge cust-status-draft",
};

export function BugReports({ bugs, canManage = true, onStatus, onDelete, onMail }: Props) {
  const language = useAuthStore((s) => s.language);

  if (bugs.length === 0) {
    return (
      <div className="cust-empty-state">
        <Bug className="h-10 w-10 mx-auto" />
        <p className="cust-empty-title">{t(language, "bugs.empty")}</p>
      </div>
    );
  }

  return (
    <div className="cust-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t(language, "bugs.table.title")}</th>
            <th>{t(language, "bugs.table.status")}</th>
            <th>{t(language, "bugs.table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((b) => (
            <tr key={b.id}>
              <td>
                <div className="font-semibold" style={{ color: "var(--text-main)" }}>{b.title}</div>
                <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{b.description || ""}</div>
              </td>
              <td>
                {canManage ? (
                <select
                  id={`bug-status-${b.id}`}
                  name={`bug_status_${b.id}`}
                  className={BUG_STATUS_MAP[b.status] ?? "cust-status-badge cust-status-draft"}
                  value={b.status}
                  onChange={(e) => onStatus(b.id, e.target.value)}
                  style={{ cursor: "pointer", outline: "none", border: "none", background: "transparent" }}
                >
                  {["new", "open", "resolved", "closed"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                ) : (
                <span className={BUG_STATUS_MAP[b.status] ?? "cust-status-badge cust-status-draft"}>{b.status}</span>
                )}
              </td>
              <td>
                {canManage ? (
                <div className="flex gap-2">
                  <button className="cust-action-view min-h-0 min-w-0" onClick={() => onMail(b.id)}>
                    {t(language, "bugs.button.email")}
                  </button>
                  <button className="cust-action-icon cust-action-icon--danger min-h-0 min-w-0" onClick={() => onDelete(b.id)} title={t(language, "common.delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                ) : (
                <span className="text-xs text-[var(--text-subtle)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

