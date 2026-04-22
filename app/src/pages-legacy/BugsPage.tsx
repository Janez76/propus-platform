import { useEffect, useState } from "react";
import { BugReports } from "../components/bugs/BugReports";
import { deleteBugReport, getBugReports, sendBugMail, type BugReport, updateBugStatus } from "../api/bugs";
import { useAuthStore } from "../store/authStore";
import { usePermissions } from "../hooks/usePermissions";

export function BugsPage() {
  const token = useAuthStore((s) => s.token);
  const { can } = usePermissions();
  const canManage = can("bugs.manage");
  const [items, setItems] = useState<BugReport[]>([]);

  async function load() {
    setItems(await getBugReports(token));
  }

  useEffect(() => {
    let alive = true;
    getBugReports(token).then((rows) => {
      if (alive) setItems(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  return (
    <BugReports
      bugs={items}
      canManage={canManage}
      onStatus={async (id, status) => { await updateBugStatus(token, id, status); await load(); }}
      onDelete={async (id) => { await deleteBugReport(token, id); await load(); }}
      onMail={async (id) => { await sendBugMail(token, id); }}
    />
  );
}

