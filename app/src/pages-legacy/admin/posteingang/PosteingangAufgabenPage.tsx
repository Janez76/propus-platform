import { useEffect, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Calendar, User, MessageSquare, GripVertical } from "lucide-react";
import {
  getPosteingangTasks,
  patchPosteingangTask,
  deletePosteingangTask,
  type PosteingangTaskRow,
} from "../../../api/toursAdmin";

type KanbanColumn = "open" | "in_progress" | "done";

const COLUMNS: { id: KanbanColumn; label: string; color: string }[] = [
  { id: "open", label: "Offen", color: "border-amber-500/50" },
  { id: "in_progress", label: "In Arbeit", color: "border-blue-500/50" },
  { id: "done", label: "Erledigt", color: "border-green-500/50" },
];

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

export function PosteingangAufgabenPage() {
  const [tasks, setTasks] = useState<PosteingangTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<KanbanColumn | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await getPosteingangTasks("limit=200");
      setTasks(r.tasks.filter((t) => t.status !== "cancelled"));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function moveTask(taskId: number, newStatus: KanbanColumn) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    try {
      await patchPosteingangTask(taskId, { status: newStatus });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      await load();
    }
  }

  async function removeTask(taskId: number) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    try {
      await deletePosteingangTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function onDragStart(e: DragEvent<HTMLDivElement>, taskId: number) {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(taskId));
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>, col: KanbanColumn) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(col);
  }

  function onDragLeave() {
    setDropTarget(null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>, col: KanbanColumn) {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData("text/plain"));
    if (taskId) void moveTask(taskId, col);
    setDropTarget(null);
    setDraggingId(null);
  }

  const tasksByColumn = (col: KanbanColumn) =>
    tasks.filter((t) => t.status === col).sort((a, b) => {
      if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return b.id - a.id;
    });

  return (
    <div className="flex min-h-screen flex-col bg-[#0c0d10] text-[#e8e4dc]">
      <header className="flex items-center justify-between border-b border-[#1e2028] px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/posteingang"
            className="inline-flex items-center gap-2 text-sm text-[#B68E20] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Posteingang
          </Link>
          <h1 className="font-serif text-lg font-semibold">Aufgaben-Board</h1>
        </div>
        <div className="text-xs text-[#888]">{tasks.length} Aufgaben</div>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-[#888]">
          <Loader2 className="h-5 w-5 animate-spin" /> Laden…
        </div>
      )}

      {!loading && (
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn(col.id);
            const isDropping = dropTarget === col.id;

            return (
              <div
                key={col.id}
                className={`flex min-w-[280px] flex-1 flex-col rounded-lg border-t-2 bg-[#111217] ${col.color} ${
                  isDropping ? "ring-2 ring-[#B68E20]/50" : ""
                }`}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.id)}
              >
                <div className="flex items-center justify-between border-b border-[#1e2028] px-3 py-2">
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="rounded-full bg-[#1e2028] px-2 py-0.5 text-xs">{colTasks.length}</span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {colTasks.length === 0 && (
                    <div className="py-8 text-center text-xs text-[#5a5a5a]">
                      {col.id === "open" ? "Keine offenen Aufgaben" : "Leer"}
                    </div>
                  )}

                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                      className={`group cursor-grab rounded-md border border-[#1e2028] bg-[#0c0d10] p-2.5 transition hover:border-[#2a2c35] active:cursor-grabbing ${
                        draggingId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">{task.title}</span>
                        <GripVertical className="h-4 w-4 shrink-0 text-[#5a5a5a] opacity-0 transition group-hover:opacity-100" />
                      </div>

                      {task.description && (
                        <p className="mb-2 line-clamp-2 text-xs text-[#888]">{task.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#888]">
                        {task.due_at && (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              new Date(task.due_at) < new Date() && col.id !== "done"
                                ? "text-red-400"
                                : ""
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            {fmtDate(task.due_at)}
                          </span>
                        )}
                        {task.conversation_id && (
                          <Link
                            to={`/admin/posteingang/${task.conversation_id}`}
                            className="inline-flex items-center gap-1 text-[#B68E20] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Thread
                          </Link>
                        )}
                        {task.customer_id && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Kunde
                          </span>
                        )}
                      </div>

                      {col.id === "done" && (
                        <button
                          type="button"
                          onClick={() => void removeTask(task.id)}
                          className="mt-2 text-xs text-red-400/70 hover:text-red-400"
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
