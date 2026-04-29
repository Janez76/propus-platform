import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { getPosteingangTasks, patchPosteingangTask, type PosteingangTaskRow } from "../../../api/toursAdmin";

export function PosteingangAufgabenPage() {
  const [tasks, setTasks] = useState<PosteingangTaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await getPosteingangTasks("status=open&limit=100");
      setTasks(r.tasks);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markDone(id: number) {
    try {
      await patchPosteingangTask(id, { status: "done" });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0d10] p-4 text-[#e8e4dc]">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/admin/posteingang"
          className="mb-4 inline-flex items-center gap-2 text-sm text-[#B68E20] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zum Posteingang
        </Link>
        <h1 className="mb-6 font-serif text-xl font-semibold">Offene Aufgaben</h1>
        {loading && (
          <div className="flex items-center gap-2 text-[#888]">
            <Loader2 className="h-5 w-5 animate-spin" /> Laden…
          </div>
        )}
        {!loading && tasks.length === 0 && <p className="text-[#888]">Keine offenen Aufgaben.</p>}
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[#1e2028] bg-[#111217] px-3 py-2"
            >
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-xs text-[#888]">
                  {t.due_at ? new Date(t.due_at).toLocaleString("de-CH") : "Ohne Fälligkeit"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void markDone(t.id)}
                className="inline-flex items-center gap-1 rounded border border-[#1e2028] px-2 py-1 text-xs hover:bg-[#15171d]"
              >
                <CheckCircle2 className="h-4 w-4" /> Erledigt
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
