import { notFound } from 'next/navigation';
import { UebersichtForm } from './uebersicht-form';
import { updateOrderOverview } from './actions';
import { loadOrderContext } from './_order-context';

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string }>;
};

export default async function UebersichtPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === '1';

  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) {
    notFound();
  }
  const order = await loadOrderContext(orderNo);
  if (!order) notFound();

  return (
    <>
      <UebersichtForm
        order={order}
        isEditing={isEditing}
        action={updateOrderOverview}
      />
    </>
  );
}
