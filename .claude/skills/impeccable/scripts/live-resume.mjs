#!/usr/bin/env node
/**
 * Recover the next agent action from the durable live-session journal.
 */

import { createLiveSessionStore } from './live-session-store.mjs';

function parseArgs(argv) {
  const out = { id: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--id') {
      const v = argv[i + 1];
      if (!v || v.startsWith('-')) {
        throw new Error('Missing value for --id');
      }
      out.id = v;
      i++;
    }
    else if (arg.startsWith('--id=')) out.id = arg.slice('--id='.length);
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

export async function resumeCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node live-resume.mjs [--id SESSION_ID]\n\nPrint the active durable session checkpoint and the next safe agent action.`);
    return;
  }

  const store = createLiveSessionStore({ cwd: process.cwd(), sessionId: args.id || undefined });
  // Ohne --id die zuletzt aktualisierte Session wählen (nicht alphabetisch erste).
  let snapshot = null;
  if (args.id) {
    snapshot = store.getSnapshot(args.id);
  } else {
    // Date.parse(0) → NaN. Erst parsen, dann || 0, damit fehlende/unparsbare
    // Timestamps deterministisch zu 0 fallen.
    const sessions = store.listActiveSessions().slice().sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
    );
    snapshot = sessions[0] || null;
  }
  if (!snapshot) {
    console.log(JSON.stringify({ active: false, nextAction: 'No active durable live session found.' }, null, 2));
    return;
  }

  const pending = snapshot.pendingEvent || null;
  const nextAction = pending
    ? `Run live-poll.mjs, handle ${pending.type} ${pending.id}, then acknowledge with live-poll.mjs --reply ${pending.id} done.`
    : snapshot.phase === 'carbonize_required'
      ? `Finish carbonize cleanup${snapshot.sourceFile ? ` in ${snapshot.sourceFile}` : ''}, then run live-complete.mjs --id ${snapshot.id}.`
      : snapshot.phase === 'accept_requested'
        ? `Run live-complete.mjs --id ${snapshot.id} after verifying the accepted variant is written.`
        : `Inspect ${snapshot.id}; no pending agent event is currently queued.`;

  console.log(JSON.stringify({ active: true, snapshot, pendingEvent: pending, nextAction }, null, 2));
}

const _running = process.argv[1];
if (_running?.endsWith('live-resume.mjs') || _running?.endsWith('live-resume.mjs/')) {
  resumeCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
