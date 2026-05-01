import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Inbox,
  RefreshCw,
  Loader2,
  Send,
  StickyNote,
  ChevronRight,
  User,
  Mail,
  CheckCircle2,
  Clock,
  Package,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  Plus,
  X,
  Tag,
  Users,
  Zap,
  Trash2,
} from "lucide-react";
import {
  getPosteingangConversations,
  getPosteingangConversation,
  postPosteingangSyncPull,
  postPosteingangMessage,
  patchPosteingangConversation,
  postPosteingangTask,
  getToursAdminCustomersList,
  postPosteingangConversation,
  postPosteingangTag,
  deletePosteingangTag,
  getPosteingangStats,
  getPosteingangAdminUsers,
  postPosteingangRunTriggers,
  deletePosteingangSyncedMessage,
  type PosteingangConversationRow,
  type PosteingangMessageRow,
  type PosteingangStats,
  type PosteingangAdminUser,
} from "../../../api/toursAdmin";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_OPTS: { value: string; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "waiting", label: "Wartet" },
  { value: "resolved", label: "Erledigt" },
];

const PRIORITY_OPTS: { value: string; label: string }[] = [
  { value: "low", label: "Niedrig" },
  { value: "medium", label: "Mittel" },
  { value: "high", label: "Hoch" },
  { value: "urgent", label: "Dringend" },
];

export function PosteingangPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get("tab") || "inbox";

  const [list, setList] = useState<PosteingangConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getPosteingangConversation>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [noteText, setNoteText] = useState("");
  const [composerTab, setComposerTab] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);

  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<{ id: number; name: string; email: string }[]>([]);
  const [custSearching, setCustSearching] = useState(false);
  const custTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  const [stats, setStats] = useState<PosteingangStats | null>(null);
  const [adminUsers, setAdminUsers] = useState<PosteingangAdminUser[]>([]);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvSubject, setNewConvSubject] = useState("");
  const [newConvChannel, setNewConvChannel] = useState("internal");
  const [newConvSaving, setNewConvSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [runningTriggers, setRunningTriggers] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);

  const selectedId = routeId || null;

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (search.trim()) qs.set("search", search.trim());
      if (tab === "mine") qs.set("assigned", "me");
      qs.set("limit", "60");
      const res = await getPosteingangConversations(qs.toString());
      setList(res.conversations);
      setTotal(res.total);
    } catch {
      setList([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, search, tab]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    getPosteingangStats().then((r) => setStats(r.stats)).catch(() => {});
    getPosteingangAdminUsers().then((r) => setAdminUsers(r.users)).catch(() => {});
  }, []);

  const loadDetail = useCallback(async (cid: string) => {
    setDetailLoading(true);
    try {
      const d = await getPosteingangConversation(cid);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function onSync() {
    setSyncing(true);
    try {
      await postPosteingangSyncPull({});
      await loadList();
      if (selectedId) await loadDetail(selectedId);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }

  async function onSend() {
    if (!selectedId || !detail) return;
    setSending(true);
    try {
      if (composerTab === "note") {
        const d = (await postPosteingangMessage(selectedId, { mode: "note", bodyText: noteText })) as Awaited<
          ReturnType<typeof getPosteingangConversation>
        >;
        setDetail(d);
        setNoteText("");
      } else {
        const d = (await postPosteingangMessage(selectedId, { mode: "reply", bodyHtml: replyHtml })) as Awaited<
          ReturnType<typeof getPosteingangConversation>
        >;
        setDetail(d);
        setReplyHtml("");
      }
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function onStatusChange(next: string) {
    if (!selectedId) return;
    try {
      const d = (await patchPosteingangConversation(selectedId, { status: next })) as Awaited<
        ReturnType<typeof getPosteingangConversation>
      >;
      setDetail(d);
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function scheduleCustomerSearch(q: string) {
    setCustQuery(q);
    if (custTimer.current) clearTimeout(custTimer.current);
    if (q.trim().length < 2) {
      setCustResults([]);
      return;
    }
    custTimer.current = setTimeout(() => {
      void (async () => {
        setCustSearching(true);
        try {
          const res = (await getToursAdminCustomersList(
            `q=${encodeURIComponent(q.trim())}&limit=10`,
          )) as { customers?: { id: number; name: string; email: string }[] };
          setCustResults(res.customers ?? []);
        } catch {
          setCustResults([]);
        } finally {
          setCustSearching(false);
        }
      })();
    }, 280);
  }

  async function onAssignCustomer(customerId: number) {
    if (!selectedId) return;
    try {
      const d = (await patchPosteingangConversation(selectedId, {
        customer_id: customerId,
      })) as Awaited<ReturnType<typeof getPosteingangConversation>>;
      setDetail(d);
      setCustResults([]);
      setCustQuery("");
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onQuickTask() {
    if (!selectedId || !taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await postPosteingangTask({
        title: taskTitle.trim(),
        conversation_id: Number(selectedId),
        ...(detail?.conversation.customer_id ? { customer_id: detail.conversation.customer_id } : {}),
        ...(taskDue ? { due_at: new Date(taskDue).toISOString() } : {}),
      });
      setTaskTitle("");
      setTaskDue("");
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setTaskSaving(false);
    }
  }

  async function onCreateConversation() {
    if (!newConvSubject.trim()) return;
    setNewConvSaving(true);
    try {
      const res = await postPosteingangConversation({
        subject: newConvSubject.trim(),
        channel: newConvChannel as "internal" | "task_only",
        priority: "medium",
      });
      setNewConvOpen(false);
      setNewConvSubject("");
      await loadList();
      if ((res as { id?: number })?.id) navigate(`/admin/posteingang/${(res as { id: number }).id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setNewConvSaving(false);
    }
  }

  async function onAddTag() {
    if (!selectedId || !tagInput.trim()) return;
    try {
      await postPosteingangTag(selectedId, tagInput.trim());
      setTagInput("");
      await loadDetail(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRemoveTag(name: string) {
    if (!selectedId) return;
    try {
      await deletePosteingangTag(selectedId, name);
      await loadDetail(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onPriorityChange(next: string) {
    if (!selectedId) return;
    try {
      const d = (await patchPosteingangConversation(selectedId, { priority: next })) as Awaited<
        ReturnType<typeof getPosteingangConversation>
      >;
      setDetail(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onAssignChange(userId: number | null) {
    if (!selectedId) return;
    try {
      const d = (await patchPosteingangConversation(selectedId, {
        assigned_admin_user_id: userId,
      })) as Awaited<ReturnType<typeof getPosteingangConversation>>;
      setDetail(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRunTriggers() {
    setRunningTriggers(true);
    try {
      const r = await postPosteingangRunTriggers();
      alert(`Trigger ausgeführt. Tasks: ${(r as { tasksCreated?: number }).tasksCreated ?? 0}, Tagged: ${(r as { tagged?: number }).tagged ?? 0}`);
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningTriggers(false);
    }
  }

  async function onDeleteSyncedMail(messageDbId: number) {
    if (!selectedId) return;
    const ok = window.confirm(
      "Diese E-Mail im Microsoft-Postfach löschen (wie Löschen in Outlook)? Sie landet im Papierkorb. Hier wird der Eintrag entfernt; bei leerem Thread auch die Konversation.",
    );
    if (!ok) return;
    setDeletingMessageId(messageDbId);
    try {
      const r = await deletePosteingangSyncedMessage(selectedId, messageDbId);
      if ((r as { conversation_removed?: boolean }).conversation_removed) {
        navigate("/admin/posteingang");
        setDetail(null);
      } else {
        await loadDetail(selectedId);
      }
      await loadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingMessageId(null);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#0c0d10] text-[#e8e4dc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2028] px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-[#B68E20]" />
          <h1 className="font-serif text-lg font-semibold tracking-tight">Posteingang</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[#1e2028] bg-[#111217] p-0.5 text-sm">
            <button
              type="button"
              className={`rounded px-3 py-1 ${tab === "inbox" ? "bg-[#1e2028] text-[#e8e4dc]" : "text-[#888]"}`}
              onClick={() => {
                setSearchParams({});
              }}
            >
              Alle
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 ${tab === "mine" ? "bg-[#1e2028] text-[#e8e4dc]" : "text-[#888]"}`}
              onClick={() => setSearchParams({ tab: "mine" })}
            >
              Meine
            </button>
          </div>
          <button
            type="button"
            onClick={() => void onSync()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded border border-[#1e2028] bg-[#111217] px-3 py-1.5 text-sm text-[#e8e4dc] hover:bg-[#15171d] disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync
          </button>
          <button
            type="button"
            onClick={() => setNewConvOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-[#1e2028] bg-[#111217] px-3 py-1.5 text-sm text-[#e8e4dc] hover:bg-[#15171d]"
          >
            <Plus className="h-4 w-4" /> Neu
          </button>
          <button
            type="button"
            onClick={() => void onRunTriggers()}
            disabled={runningTriggers}
            className="inline-flex items-center gap-1 rounded border border-[#1e2028] bg-[#111217] px-3 py-1.5 text-sm text-[#e8e4dc] hover:bg-[#15171d] disabled:opacity-50"
            title="Auto-Trigger ausführen (Mahnungen, Verlängerungen, Neukunde-Tag)"
          >
            <Zap className="h-4 w-4" />
          </button>
          <Link
            to="/admin/posteingang/aufgaben"
            className="rounded border border-[#B68E20]/40 bg-[#B68E20]/10 px-3 py-1.5 text-sm text-[#B68E20] hover:bg-[#B68E20]/20"
          >
            Aufgaben
          </Link>
        </div>
      </header>

      {stats && (
        <div className="flex flex-wrap gap-4 border-b border-[#1e2028] bg-[#111217]/50 px-4 py-2 text-xs">
          <span className="text-[#888]">
            Offen: <span className="text-[#e8e4dc]">{stats.open_conversations ?? 0}</span>
          </span>
          <span className="text-[#888]">
            In Arbeit: <span className="text-[#e8e4dc]">{stats.in_progress_conversations ?? 0}</span>
          </span>
          <span className="text-[#888]">
            Wartet: <span className="text-[#e8e4dc]">{stats.waiting_conversations ?? 0}</span>
          </span>
          <span className="text-[#888]">
            Offene Tasks: <span className="text-[#e8e4dc]">{stats.open_tasks ?? 0}</span>
          </span>
          {stats.avg_response_time_hours != null && (
            <span className="text-[#888]">
              Ø Antwortzeit: <span className="text-[#e8e4dc]">{stats.avg_response_time_hours.toFixed(1)}h</span>
            </span>
          )}
        </div>
      )}

      {newConvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#1e2028] bg-[#0c0d10] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-lg">Neue Konversation</h3>
              <button type="button" onClick={() => setNewConvOpen(false)} className="text-[#888] hover:text-[#e8e4dc]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="mb-1 block text-sm text-[#888]">Betreff</span>
              <input
                type="text"
                value={newConvSubject}
                onChange={(e) => setNewConvSubject(e.target.value)}
                className="w-full rounded border border-[#1e2028] bg-[#111217] px-3 py-2 text-sm text-[#e8e4dc]"
                placeholder="Betreff eingeben…"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm text-[#888]">Typ</span>
              <select
                value={newConvChannel}
                onChange={(e) => setNewConvChannel(e.target.value)}
                className="w-full rounded border border-[#1e2028] bg-[#111217] px-3 py-2 text-sm"
              >
                <option value="internal">Intern</option>
                <option value="task_only">Nur Aufgabe</option>
              </select>
            </label>
            <button
              type="button"
              disabled={newConvSaving || !newConvSubject.trim()}
              onClick={() => void onCreateConversation()}
              className="w-full rounded bg-[#B68E20] px-4 py-2 text-sm font-medium text-[#0c0d10] hover:bg-[#c49a28] disabled:opacity-40"
            >
              {newConvSaving ? "Erstellen…" : "Erstellen"}
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[320px_1fr_280px]">
        {/* Liste */}
        <aside className="flex min-h-0 flex-col border-b border-[#1e2028] lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-[#1e2028] p-3">
            <input
              type="search"
              placeholder="Suche Betreff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadList()}
              className="w-full rounded border border-[#1e2028] bg-[#111217] px-2 py-1.5 text-sm text-[#e8e4dc] placeholder:text-[#5a5a5a]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded border border-[#1e2028] bg-[#111217] px-2 py-1.5 text-sm"
            >
              {STATUS_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading && <p className="p-4 text-sm text-[#888]">Laden…</p>}
            {!listLoading && list.length === 0 && <p className="p-4 text-sm text-[#888]">Keine Konversationen. Sync ausführen.</p>}
            {list.map((c) => {
              const active = String(c.id) === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/admin/posteingang/${c.id}`)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-[#1e2028]/60 px-3 py-2.5 text-left text-sm transition hover:bg-[#15171d] ${
                    active ? "bg-[#15171d] border-l-2 border-l-[#B68E20]" : ""
                  }`}
                >
                  <span className="line-clamp-2 font-medium text-[#e8e4dc]">{c.subject || "(Ohne Betreff)"}</span>
                  <span className="text-xs text-[#888]">
                    {c.channel === "email" ? "E-Mail" : c.channel} · {fmtDate(c.last_message_at)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-[#1e2028] p-2 text-center text-xs text-[#5a5a5a]">{total} gesamt</div>
        </aside>

        {/* Detail */}
        <main className="flex min-h-0 min-w-0 flex-col border-b border-[#1e2028] lg:border-b-0">
          {!selectedId && (
            <div className="flex flex-1 items-center justify-center p-8 text-[#888]">
              Konversation wählen oder Sync starten.
            </div>
          )}
          {selectedId && detailLoading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-[#888]">
              <Loader2 className="h-6 w-6 animate-spin" /> Laden…
            </div>
          )}
          {selectedId && !detailLoading && detail && (
            <>
              <div className="border-b border-[#1e2028] px-4 py-3">
                <h2 className="font-medium text-[#e8e4dc]">{detail.conversation.subject}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={detail.conversation.status}
                    onChange={(e) => void onStatusChange(e.target.value)}
                    className="rounded border border-[#1e2028] bg-[#111217] px-2 py-1 text-sm"
                  >
                    {STATUS_OPTS.filter((s) => s.value !== "all").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={detail.conversation.priority}
                    onChange={(e) => void onPriorityChange(e.target.value)}
                    className="rounded border border-[#1e2028] bg-[#111217] px-2 py-1 text-sm"
                  >
                    {PRIORITY_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={String(detail.conversation.assigned_admin_user_id ?? "")}
                    onChange={(e) => void onAssignChange(e.target.value ? Number(e.target.value) : null)}
                    className="rounded border border-[#1e2028] bg-[#111217] px-2 py-1 text-sm"
                  >
                    <option value="">Nicht zugewiesen</option>
                    {adminUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-[#888]">
                    {detail.conversation.channel === "email" ? <Mail className="inline h-3 w-3" /> : null}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {detail.tags?.map((tagName) => (
                    <span
                      key={tagName}
                      className="inline-flex items-center gap-1 rounded-full border border-[#B68E20]/40 bg-[#B68E20]/10 px-2 py-0.5 text-xs text-[#B68E20]"
                    >
                      <Tag className="h-3 w-3" />
                      {tagName}
                      <button
                        type="button"
                        onClick={() => void onRemoveTag(tagName)}
                        className="ml-0.5 rounded-full hover:bg-[#B68E20]/30"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onAddTag();
                    }}
                    className="inline-flex"
                  >
                    <input
                      type="text"
                      placeholder="+Tag"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      className="w-16 rounded border border-[#1e2028] bg-[#111217] px-1.5 py-0.5 text-xs"
                    />
                  </form>
                </div>
                {detail.conversation.channel === "email" && !detail.conversation.customer_id && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Kein Kunde erkannt (Freemail-Domains werden nicht automatisch zugeordnet). Unten im Kontextpanel zuweisen oder in der Kundenverwaltung Stammdaten pflegen.</span>
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-4">
                  {detail.messages.map((m: PosteingangMessageRow) => (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      channel={detail.conversation.channel}
                      deleting={deletingMessageId === m.id}
                      onDeleteSynced={() => void onDeleteSyncedMail(m.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="border-t border-[#1e2028] p-3">
                <div className="mb-2 flex gap-1 rounded border border-[#1e2028] p-0.5 text-sm">
                  <button
                    type="button"
                    className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 ${
                      composerTab === "reply" ? "bg-[#1e2028]" : "text-[#888]"
                    }`}
                    onClick={() => setComposerTab("reply")}
                  >
                    <Send className="h-3.5 w-3.5" /> Antwort
                  </button>
                  <button
                    type="button"
                    className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 ${
                      composerTab === "note" ? "bg-[#1e2028]" : "text-[#888]"
                    }`}
                    onClick={() => setComposerTab("note")}
                  >
                    <StickyNote className="h-3.5 w-3.5" /> Notiz
                  </button>
                </div>
                {composerTab === "reply" && detail.conversation.channel === "email" && (
                  <textarea
                    value={replyHtml}
                    onChange={(e) => setReplyHtml(e.target.value)}
                    placeholder="HTML-Antwort…"
                    rows={5}
                    className="w-full rounded border border-[#1e2028] bg-[#111217] px-2 py-2 font-mono text-sm text-[#e8e4dc]"
                  />
                )}
                {composerTab === "reply" && detail.conversation.channel !== "email" && (
                  <p className="text-sm text-[#888]">Antworten nur bei E-Mail-Konversationen.</p>
                )}
                {composerTab === "note" && (
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Interne Notiz…"
                    rows={4}
                    className="w-full rounded border border-[#1e2028] bg-[#111217] px-2 py-2 text-sm text-[#e8e4dc]"
                  />
                )}
                <button
                  type="button"
                  disabled={sending || (composerTab === "reply" && detail.conversation.channel !== "email")}
                  onClick={() => void onSend()}
                  className="mt-2 w-full rounded bg-[#B68E20] px-3 py-2 text-sm font-medium text-[#0c0d10] hover:bg-[#c49a28] disabled:opacity-40"
                >
                  {sending ? "Senden…" : composerTab === "reply" ? "Antwort senden" : "Notiz speichern"}
                </button>
              </div>
            </>
          )}
        </main>

        {/* Kontext */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-[#1e2028] lg:flex">
          {detail?.conversation && (
            <div className="space-y-4 p-4 text-sm">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[#5a5a5a]">Kunde</div>
                {detail.conversation.customer_id ? (
                  <Link
                    to={`/customers?highlight=${detail.conversation.customer_id}`}
                    className="flex items-center gap-2 text-[#B68E20] hover:underline"
                  >
                    <User className="h-4 w-4" />
                    {detail.conversation.customer_name || `Kunde #${detail.conversation.customer_id}`}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="text-[#888]">Nicht zugeordnet</span>
                )}
                {detail.conversation.customer_email && (
                  <div className="mt-1 text-xs text-[#888]">{detail.conversation.customer_email}</div>
                )}
                {!detail.conversation.customer_id && (
                  <div className="mt-2">
                    <input
                      type="search"
                      placeholder="Kunde suchen…"
                      value={custQuery}
                      onChange={(e) => scheduleCustomerSearch(e.target.value)}
                      className="w-full rounded border border-[#1e2028] bg-[#111217] px-2 py-1.5 text-xs text-[#e8e4dc]"
                    />
                    {custSearching && <p className="mt-1 text-xs text-[#888]">Suche…</p>}
                    {custResults.length > 0 && (
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-[#1e2028] bg-[#111217]">
                        {custResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => void onAssignCustomer(c.id)}
                              className="w-full px-2 py-1.5 text-left text-xs hover:bg-[#15171d]"
                            >
                              <span className="font-medium text-[#e8e4dc]">{c.name}</span>
                              <span className="block text-[#888]">{c.email}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-[#1e2028] bg-[#111217] p-2">
                <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-[#5a5a5a]">
                  <Plus className="h-3 w-3" /> Aufgabe
                </div>
                <input
                  type="text"
                  placeholder="Titel"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="mb-1 w-full rounded border border-[#1e2028] bg-[#0c0d10] px-2 py-1 text-xs"
                />
                <input
                  type="datetime-local"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="mb-2 w-full rounded border border-[#1e2028] bg-[#0c0d10] px-2 py-1 text-xs text-[#e8e4dc]"
                />
                <button
                  type="button"
                  disabled={taskSaving || !taskTitle.trim()}
                  onClick={() => void onQuickTask()}
                  className="w-full rounded bg-[#B68E20]/90 px-2 py-1.5 text-xs font-medium text-[#0c0d10] hover:bg-[#c49a28] disabled:opacity-40"
                >
                  {taskSaving ? "…" : "Anlegen"}
                </button>
              </div>

              {detail.tasks && detail.tasks.length > 0 && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-[#5a5a5a]">Aufgaben (Thread)</div>
                  <ul className="space-y-1">
                    {detail.tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-[#e8e4dc]">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#888]" />
                        <span>{t.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.related?.tours && detail.related.tours.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-[#5a5a5a]">
                    <Package className="h-3 w-3" /> Touren
                  </div>
                  <ul className="space-y-1">
                    {detail.related.tours.map((t) => (
                      <li key={t.id}>
                        <Link
                          to={`/admin/tours/${t.id}`}
                          className="text-[#B68E20] hover:underline"
                        >
                          {t.bezeichnung || `Tour #${t.id}`}
                        </Link>
                        <span className="ml-1 text-xs text-[#888]">{t.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.related?.orders && detail.related.orders.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-[#5a5a5a]">
                    <ShoppingCart className="h-3 w-3" /> Aufträge
                  </div>
                  <ul className="space-y-1.5">
                    {detail.related.orders.map((o) => (
                      <li key={o.id}>
                        <Link to={`/orders/${o.order_no}`} className="text-[#B68E20] hover:underline">
                          #{o.order_no}
                        </Link>
                        <span className="ml-1 text-xs text-[#888]">{o.status}</span>
                        {o.address && (
                          <div className="text-xs text-[#888] truncate" title={o.address}>
                            {o.address}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.related?.renewal_invoices && detail.related.renewal_invoices.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-[#5a5a5a]">
                    <Receipt className="h-3 w-3" /> Verlängerung
                  </div>
                  <ul className="space-y-1 text-xs">
                    {detail.related.renewal_invoices.map((r) => (
                      <li key={r.id} className="text-[#e8e4dc]">
                        {r.invoice_number || `RI-${r.id}`}
                        <span className="text-[#888]"> · {r.invoice_status}</span>
                        {r.amount_chf != null && <span className="text-[#888]"> · {String(r.amount_chf)} CHF</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.related?.exxas_invoices && detail.related.exxas_invoices.length > 0 && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-[#5a5a5a]">Exxas</div>
                  <ul className="space-y-1 text-xs">
                    {detail.related.exxas_invoices.map((x) => (
                      <li key={x.id} className="text-[#e8e4dc]">
                        {x.nummer || `EX-${x.id}`}
                        <span className="text-[#888]"> · {x.exxas_status || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  channel,
  deleting,
  onDeleteSynced,
}: {
  m: PosteingangMessageRow;
  channel: string;
  deleting: boolean;
  onDeleteSynced: () => void;
}) {
  const note = m.direction === "internal_note";
  const inbound = m.direction === "inbound";
  const align = note ? "mx-auto max-w-[95%] border border-amber-500/30 bg-amber-500/10" : inbound ? "mr-auto max-w-[92%] bg-[#111217]" : "ml-auto max-w-[92%] bg-[#1a1c24]";
  const canDeleteFromMailbox =
    channel === "email" &&
    (m.direction === "inbound" || m.direction === "outbound") &&
    Boolean(m.graph_message_id);
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${align}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#888]">
        <div className="flex flex-wrap items-center gap-2">
          {note ? <StickyNote className="h-3 w-3" /> : inbound ? <Mail className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          <span>{m.from_email || m.author_email || "—"}</span>
          <span>· {fmtDate(m.sent_at)}</span>
        </div>
        {canDeleteFromMailbox && (
          <button
            type="button"
            disabled={deleting}
            onClick={onDeleteSynced}
            title="Im Postfach löschen (Outlook)"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-red-500/35 px-1.5 py-0.5 text-[11px] text-red-300/95 hover:bg-red-500/15 disabled:opacity-40"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Löschen
          </button>
        )}
      </div>
      {m.body_html && m.direction !== "internal_note" ? (
        <div className="prose prose-invert max-w-none text-[#e8e4dc]" dangerouslySetInnerHTML={{ __html: m.body_html }} />
      ) : (
        <div className="whitespace-pre-wrap text-[#e8e4dc]">{m.body_text || ""}</div>
      )}
    </div>
  );
}
