'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';

export async function updateOrderOverview(formData: FormData) {
  const orderNo = formData.get('order_no') as string;
  if (!orderNo) throw new Error('Fehlende Bestellungsnummer');

  const bookingType = formData.get('booking_type') as 'firma' | 'privat';
  const companyName = (formData.get('company_name') as string) || null;

  const billingPatch = {
    company:    bookingType === 'firma' ? (companyName || null) : null,
    order_ref:  (formData.get('order_reference') as string) || null,
    street:     formData.get('billing_street') as string,
    zip:        formData.get('billing_zip') as string,
    city:       formData.get('billing_city') as string,
    salutation: formData.get('contact_salutation') as string,
    first_name: formData.get('contact_first_name') as string,
    name:       formData.get('contact_last_name') as string,
    email:      formData.get('contact_email') as string,
    phone:      (formData.get('contact_phone') as string) || null,
  };

  await query(
    `UPDATE booking.orders
     SET billing = billing || $1::jsonb,
         updated_at = NOW()
     WHERE order_no = $2`,
    [JSON.stringify(billingPatch), orderNo],
  );

  revalidatePath(`/orders/${orderNo}`);
  redirect(`/orders/${orderNo}`);
}
