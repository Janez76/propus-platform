import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { queryOne, query } from "@/lib/db";
import { Empty } from "../_shared";
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

export default async function KommunikationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  return (
    <div className="space-y-5">
      <section className="bd-sect">
        <header className="bd-sect-head">
          <MessageSquare />
          <h2>Nachrichten</h2>
        </header>
        <div className="bd-sect-body">
          {messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((msg) => (
                <MessageRowWithDelete key={`${msg.kind}-${msg.id}`} msg={msg} orderNo={orderCheck.order_no} />
              ))}
            </div>
          ) : (
            <Empty>Keine Nachrichten vorhanden</Empty>
          )}
        </div>
      </section>
      <KommunikationComposer orderNo={orderCheck.order_no} />
    </div>
  );
}
