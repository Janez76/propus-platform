import { query } from "@/lib/db";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export type ScheduleConflict = {
  orderNo: number;
  scheduleTime: string | null;
  durationMin: number | null;
};

/**
 * Prüft ob für denselben Fotografen am selben Tag eine Überschneidung mit anderen Bestellungen besteht.
 */
export async function findScheduleConflicts(params: {
  orderNo: number;
  photographerKey: string | null;
  scheduleDate: string;
  scheduleTime: string;
  durationMin: number;
}): Promise<ScheduleConflict[]> {
  if (!params.photographerKey) return [];

  const rows = await query<{
    order_no: number;
    schedule_time: string | null;
    duration_min: number | null;
  }>(
    `SELECT
        order_no,
        schedule_time,
        (schedule->>'durationMin')::int AS duration_min
     FROM booking.orders
     WHERE order_no != $1
       AND photographer_key = $2
       AND schedule_date = $3::date
       AND status NOT IN ('cancelled', 'archived')`,
    [params.orderNo, params.photographerKey, params.scheduleDate],
  );

  const s1 = timeToMinutes(params.scheduleTime);
  const e1 = s1 + params.durationMin;

  const conflicts: ScheduleConflict[] = [];
  for (const row of rows) {
    if (!row.schedule_time) continue;
    const t = String(row.schedule_time).slice(0, 5);
    const s2 = timeToMinutes(t);
    const d2 = row.duration_min && row.duration_min > 0 ? row.duration_min : 60;
    const e2 = s2 + d2;
    if (s1 < e2 && s2 < e1) {
      conflicts.push({
        orderNo: Number(row.order_no),
        scheduleTime: row.schedule_time,
        durationMin: row.duration_min,
      });
    }
  }
  return conflicts;
}
