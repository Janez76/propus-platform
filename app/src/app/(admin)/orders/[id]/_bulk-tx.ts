/**
 * Gemeinsame Tx-Hilfen fuer Order-Sub-Actions, damit saveOrderAllSections
 * alle Schritte in EINER Transaktion ausfuehren und ggf. zusammen
 * zurueckrollen kann (Bug-Hunt T02 HIGH: Multi-Step ohne Tx).
 *
 * Sub-Actions akzeptieren optional `tx` (eingehaengte Transaktion) und
 * `postCommit` (Side-Effects die erst nach erfolgreichem Commit laufen
 * duerfen — HTTP-Calls, Mailversand). Wird `tx` weggelassen, laufen sie
 * wie bisher in eigenen Verbindungen mit sofortigem Side-Effect.
 */

import type { PoolClient } from "pg";

export type PostCommitTask = () => Promise<void>;

/**
 * Sammelt Side-Effects, die erst NACH erfolgreichem Tx-Commit laufen
 * sollen. Fehler einzelner Tasks duerfen den Bulk-Save nicht mehr in
 * inkonsistenten Zustand bringen — sie werden geloggt und gesammelt.
 */
export class PostCommitQueue {
  private readonly tasks: PostCommitTask[] = [];
  push(task: PostCommitTask): void {
    this.tasks.push(task);
  }
  async run(label = "post-commit"): Promise<{ errors: unknown[] }> {
    // Konsumierend: bereits gelaufene Tasks duerfen bei einem
    // versehentlichen erneuten run() nicht ein zweites Mal feuern
    // (CodeRabbit Minor #259).
    const tasks = this.tasks.splice(0);
    const errors: unknown[] = [];
    for (const task of tasks) {
      try {
        await task();
      } catch (err) {
        errors.push(err);
        console.error(`[${label}] task failed`, err instanceof Error ? err.message : err);
      }
    }
    return { errors };
  }
}

export type BulkTxOptions = {
  /** Eingehaengte Transaktion. Sub-Action queryt darueber statt eigene Connection zu nehmen. */
  tx?: PoolClient;
  /** Sammler fuer Side-Effects, die nach Commit ausgefuehrt werden. Wenn weggelassen, laufen sie sofort. */
  postCommit?: PostCommitQueue;
};
