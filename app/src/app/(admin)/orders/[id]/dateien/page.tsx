import { notFound } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { OrderStoragePanel } from '@/components/orders/OrderStoragePanel';

export default async function DateienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const orderCheck = await queryOne<{ order_no: number; address: string | null }>(`
    SELECT order_no, address FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  return (
    <OrderStoragePanel
      orderNo={String(orderCheck.order_no)}
      orderAddress={orderCheck.address ?? undefined}
    />
  );
}
