import { notFound } from "next/navigation";
import { MessageSquare, Bot, User, Lock } from "lucide-react";
import { queryOne, query } from "@/lib/db";
import { Empty, KpiGrid, Kpi } from "../_shared";
import { KommunikationComposer } from "./kommunikation-composer";
import { MessageRowWithDelete } from "./message-row";

type Message = {
  id: number;
  kind: "system" | "chat";
  sender_role: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
  is_internal?: boolean;
  deleted_at?: string | null;
};

type SP = { kind?: string; q?: string };

export default async function KommunikationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SP>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : ({} as SP);

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  const [systemMessages, chatMessages] = await Promise.all([
    query<Omit<Message, "kind" | "is_internal" | "deleted_at">>(`
      SELECT id, sender_role, sender_name, message, created_at
      FROM booking.order_messages
      WHERE order_no = $1
      ORDER BY created_at ASC
    `, [id]),

    query<{
      id: number;
      sender_role: string | null;
      sender_name: string | null;
      message: string;
      created_at: string;
      is_internal: boolean | null;
      deleted_at: string | null;
    }>(`
      SELECT id, sender_role, sender_name, message, created_at,
             COALESCE(is_internal, false) AS is_internal,
             deleted_at
      FROM booking.order_chat_messages
      WHERE order_no = $1
      ORDER BY created_at ASC
    `, [id]),
  ]);

  const messages: Message[] = [
    ...systemMessages.map((m) => ({ ...m, kind: "system" as const, is_internal: false, deleted_at: null })),
    ...chatMessages
      .filter((m) => !m.deleted_at)
      .map((m) => ({
        ...m,
        kind: "chat" as const,
        is_internal: Boolean(m.is_internal),
        deleted_at: m.deleted_at,
      })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const totalCount = messages.length;
  const systemCount = messages.filter((m) => m.kind === "system").length;
  const chatCount = messages.filter((m) => m.kind === "chat").length;
  const internalCount = messages.filter((m) => m.is_internal).length;

  const kind = sp.kind ?? "";
  const q = (sp.q ?? "").trim().toLowerCase();

  const filtered = messages.filter((m) => {
    if (kind === "system" && m.kind !== "system") return false;
    if (kind === "chat" && (m.kind !== "chat" || m.is_internal)) return false;
    if (kind === "internal" && !m.is_internal) return false;
    if (q) {
      const hay = `${m.message} ${m.sender_name ?? ""} ${m.sender_role ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi
          icon={<MessageSquare />}
          label="Nachrichten"
          value={totalCount}
          sub={totalCount === 0 ? "noch keine" : undefined}
        />
        <Kpi
          icon={<Bot />}
          label="System"
          value={systemCount}
          accent="info"
        />
        <Kpi
          icon={<User />}
          label="Chat"
          value={chatCount - internalCount}
          accent="gold"
        />
        <Kpi
          icon={<Lock />}
          label="Interne Notizen"
          value={internalCount}
          accent="warn"
        />
      </KpiGrid>

      <form action={`/orders/${id}/kommunikation`} method="get" className="bd-filterbar">
        <label>
          Suche
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nachricht oder Absender …"
          />
        </label>
        <label>
          Typ
          <select name="kind" defaultValue={kind}>
            <option value="">Alle</option>
            <option value="system">System</option>
            <option value="chat">Chat</option>
            <option value="internal">Interne Notizen</option>
          </select>
        </label>
        <button type="submit" className="bd-btn-outline-gold">Anwenden</button>
        {(kind || q) && (
          <a href={`/orders/${id}/kommunikation`} className="bd-btn-ghost">
            Zurücksetzen
          </a>
        )}
      </form>

      <section className="bd-sect">
        <header className="bd-sect-head">
          <MessageSquare />
          <h2>Nachrichten</h2>
          {filtered.length !== totalCount && (
            <span className="ml-auto text-xs text-[var(--ink-3)] font-mono">
              {filtered.length} / {totalCount}
            </span>
          )}
        </header>
        <div className="bd-sect-body">
          {filtered.length > 0 ? (
            <div className="space-y-3">
              {filtered.map((msg) => (
                <MessageRowWithDelete key={`${msg.kind}-${msg.id}`} msg={msg} orderNo={orderCheck.order_no} />
              ))}
            </div>
          ) : totalCount === 0 ? (
            <Empty>Keine Nachrichten vorhanden</Empty>
          ) : (
            <Empty>Keine Nachrichten für diesen Filter</Empty>
          )}
        </div>
      </section>
      <KommunikationComposer orderNo={orderCheck.order_no} />
    </div>
  );
}
