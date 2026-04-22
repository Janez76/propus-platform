import { notFound } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { UebersichtForm } from './uebersicht-form';
import { updateOrderOverview } from './actions';
import { OrderSaveToast } from './order-save-toast';

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string }>;
};

export default async function UebersichtPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === '1';

  const order = await queryOne<{
    id: number;
    order_no: number;
    booking_type: 'firma' | 'privat';
    company_name: string | null;
    order_reference: string | null;
    billing_street: string | null;
    billing_zip: string | null;
    billing_city: string | null;
    contact_salutation: string | null;
    contact_first_name: string | null;
    contact_last_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }>(`
    SELECT
      id,
      order_no,
      CASE
        WHEN billing->>'company' IS NOT NULL AND billing->>'company' != ''
        THEN 'firma'
        ELSE 'privat'
      END                         AS booking_type,
      billing->>'company'         AS company_name,
      billing->>'order_ref'       AS order_reference,
      billing->>'street'          AS billing_street,
      billing->>'zip'             AS billing_zip,
      billing->>'city'            AS billing_city,
      billing->>'salutation'      AS contact_salutation,
      billing->>'first_name'      AS contact_first_name,
      billing->>'name'            AS contact_last_name,
      billing->>'email'           AS contact_email,
      billing->>'phone'           AS contact_phone
    FROM booking.orders
    WHERE order_no = $1
  `, [id]);

  if (!order) notFound();

  return (
    <>
      <OrderSaveToast />
      <UebersichtForm
        order={order}
        isEditing={isEditing}
        action={updateOrderOverview}
      />
    </>
  );
}
