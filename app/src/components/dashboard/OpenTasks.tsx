import { useMemo, useState } from "react";
import { ArrowUpRight, Check, GripVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Priority = "high" | "med" | "low";

interface Task {
  id: string;
  textKey: string;
  metaKey: string;
  prio: Priority;
  due: string;
  dueToday?: boolean;
  done?: boolean;
}

// Placeholder task set. Real tasks will plug in once a tasks API exists.
const SEED_TASKS: Task[] = [
  { id: "t1", textKey: "dashboard.task.release", metaKey: "dashboard.task.release.meta", prio: "high", due: "dashboard.task.due.today", dueToday: true },
  { id: "t2", textKey: "dashboard.task.inquiry", metaKey: "dashboard.task.inquiry.meta", prio: "high", due: "dashboard.task.due.today", dueToday: true },
  { id: "t3", textKey: "dashboard.task.delivery", metaKey: "dashboard.task.delivery.meta", prio: "med", due: "14:00", dueToday: true },
  { id: "t4", textKey: "dashboard.task.offer", metaKey: "dashboard.task.offer.meta", prio: "med", due: "dashboard.task.due.nextWeek" },
  { id: "t5", textKey: "dashboard.task.invoice", metaKey: "dashboard.task.invoice.meta", prio: "low", due: "dashboard.task.due.done", done: true },
  { id: "t6", textKey: "dashboard.task.matterport", metaKey: "dashboard.task.matterport.meta", prio: "low", due: "dashboard.task.due.endOfWeek" },
];

interface OpenTasksProps {
  hideDone: boolean;
}

export function OpenTasks({ hideDone }: OpenTasksProps) {
  const lang = useAuthStore((s) => s.language);
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);

  const toggle = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const visible = useMemo(() => (hideDone ? tasks.filter((t) => !t.done) : tasks), [tasks, hideDone]);
  const doneCount = tasks.filter((t) => t.done).length;

  const resolveDue = (raw: string): string => {
    if (raw.startsWith("dashboard.")) return t(lang, raw);
    return raw;
  };

  return (
    <div className="pds-panel" data-tile="tasks">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.tasks.title")}</h2>
          <div className="sub">
            {t(lang, "dashboard.tasks.done").replace("{{done}}", String(doneCount)).replace("{{total}}", String(tasks.length))}
          </div>
        </div>
        <Link className="see" to="/orders">
          {t(lang, "dashboard.tasks.all")} <ArrowUpRight />
        </Link>
      </div>
      <div className="pds-tasks">
        {visible.map((task) => (
          <div key={task.id} className={`pds-task${task.done ? " done" : ""}`}>
            <button
              type="button"
              className="check"
              onClick={() => toggle(task.id)}
              aria-label={task.done ? t(lang, "dashboard.tasks.markOpen") : t(lang, "dashboard.tasks.markDone")}
              aria-pressed={task.done}
            >
              <Check style={{ width: 12, height: 12 }} />
            </button>
            <div className="text">
              {t(lang, task.textKey)}
              <span className="meta">{t(lang, task.metaKey)}</span>
            </div>
            <span className={`prio ${task.prio}`}>{t(lang, `dashboard.tasks.prio.${task.prio}`)}</span>
            <span className={`due${task.dueToday ? " today" : ""}`}>{resolveDue(task.due)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
