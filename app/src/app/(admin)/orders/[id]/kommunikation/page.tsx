import { notFound } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { queryOne, query } from '@/lib/db';
import { Empty, formatTS } from '../_shared';

type Message = {
  id: number;
  kind: 'system' | 'chat';
  sender_role: string | null;
  sender_name: string | null;
  message: string;
  created_at: string;
};

export default async function KommunikationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  const [systemMessages, chatMessages] = await Promise.all([
    query<Omit<Message, 'kind'>>(`
      SELECT id, sender_role, sender_name, message, created_at
      FROM booking.order_messages
      WHERE order_no = $1
      ORDER BY created_at ASC
    `, [id]),

    query<Omit<Message, 'kind'>>(`
      SELECT id, sender_role, sender_name, message, created_at
      FROM booking.order_chat_messages
      WHERE order_no = $1
      ORDER BY created_at ASC
    `, [id]),
  ]);

  const messages: Message[] = [
    ...systemMessages.map((m) => ({ ...m, kind: 'system' as const })),
    ...chatMessages.map((m) => ({ ...m, kind: 'chat' as const })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        <MessageSquare className="h-4 w-4" />
        Nachrichten
      </h2>

      {messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((msg) => (
            <MessageRow key={`${msg.kind}-${msg.id}`} msg={msg} />
          ))}
        </div>
      ) : (
        <Empty>Keine Nachrichten vorhanden</Empty>
      )}
    </div>
  );
}

function MessageRow({ msg }: { msg: Message }) {
  const isSystem = msg.kind === 'system';
  const roleColor = isSystem ? 'text-white/40' : 'text-[#B68E20]';
  const roleLabel = msg.sender_role ?? (isSystem ? 'System' : 'Unbekannt');

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium uppercase ${roleColor}`}>{roleLabel}</span>
          {msg.sender_name && (
            <span className="text-xs text-white/50">{msg.sender_name}</span>
          )}
          {!isSystem && (
            <span className="rounded-full bg-[#B68E20]/10 px-1.5 py-0.5 text-[10px] text-[#B68E20]">
              Chat
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-white/30 tabular-nums">{formatTS(msg.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{msg.message}</p>
    </div>
  );
}
