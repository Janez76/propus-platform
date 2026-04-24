import { query, queryOne, withTransaction } from "@/lib/db";
import type { OrderStatus } from "@/lib/validators/common";

export type OrderRowSchedule = {
  order_no: number;
  status: string;
  schedule_date: string | null;
  schedule_time: string | null;
  schedule: Record<string, unknown> | null;
  photographer_key: string | null;
};

export async function getOrderForTerminEdit(orderNo: string | number): Promise<OrderRowSchedule | null> {
  return queryOne<OrderRowSchedule>(
    `SELECT
        order_no, status, schedule_date, schedule_time, schedule, photographer_key
     FROM booking.orders
     WHERE order_no = $1`,
    [orderNo],
  );
}

export async function buildPhotographerJson(
  c: import("pg").PoolClient,
  key: string | null,
): Promise<Record<string, unknown>> {
  if (!key) return {};
  const { rows } = await c.query<{ key: string; name: string; email: string; phone: string }>(
    `SELECT key, name, email, phone FROM booking.photographers WHERE key = $1 LIMIT 1`,
    [key],
  );
  const p = rows[0];
  if (!p) return { key };
  return {
    key: p.key,
    name: p.name || "",
    email: p.email || "",
    phone: p.phone || "",
  };
}

export async function updateOrderTermin(params: {
  orderNo: number;
  scheduleDate: string;
  scheduleTime: string;
  durationMin: number;
  status: OrderStatus;
  photographerKey: string | null;
}): Promise<void> {
  await withTransaction(async (c) => {
    const photo = await buildPhotographerJson(c, params.photographerKey);
    const schedPatch = {
      date: params.scheduleDate,
      time: params.scheduleTime,
      durationMin: params.durationMin,
    };
    await c.query(
      `UPDATE booking.orders SET
         schedule = COALESCE(schedule, '{}'::jsonb) || $2::jsonb,
         status = $3,
         photographer = $4::jsonb,
         updated_at = NOW()
       WHERE order_no = $1`,
      [params.orderNo, JSON.stringify(schedPatch), params.status, JSON.stringify(photo)],
    );
  });
}

export type PhotographerOption = { key: string; name: string | null; email: string | null };

export async function listPhotographers(): Promise<PhotographerOption[]> {
  return query<PhotographerOption>(
    `SELECT key, name, email
     FROM booking.photographers
     WHERE active IS NOT FALSE
     ORDER BY name ASC, key ASC`,
  );
}
