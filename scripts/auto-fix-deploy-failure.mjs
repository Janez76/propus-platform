#!/usr/bin/env node
/**
 * Auto-Fix-Bot fuer Deploy-Failure-Issues.
 *
 * Wird von .github/workflows/auto-fix-deploy-failure.yml aufgerufen wenn
 * ein Issue mit Label "deploy-failure" erstellt wird. Bekommt:
 *   - ANTHROPIC_API_KEY (Secret)
 *   - ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, ISSUE_URL (Issue-Metadaten)
 *   - GH_TOKEN (fuer gh-CLI bei branch/PR-Erstellung)
 *
 * Output (via $GITHUB_OUTPUT):
 *   - pr_url:  URL des erstellten PRs (falls erfolgreich)
 *   - reason:  Grund warum kein Fix moeglich war (falls "no-fix")
 *
 * Safety:
 *   - Schreibe-Deny-Liste fuer .env*, .github/workflows/*, secrets
 *   - Max 5 Datei-Modifikationen
 *   - Max 20 Tool-Use-Iterationen
 *   - Shell ist read-only (whitelisted Commands)
 *   - PR wird erstellt aber NICHT auto-gemergt
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

// ─── Config ────────────────────────────────────────────────────────────────

const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 16000;
const MAX_ITERATIONS = 20;
const MAX_FILE_MODIFICATIONS = 5;

const DENY_WRITE_GLOBS = [
  /^\.env(\..+)?$/,
  /^\.github\/workflows\//,
  /(^|\/)secret/i,
  /\.key$/,
  /\.pem$/,
  /^\.git\//,
  /node_modules\//,
];

const SHELL_ALLOWLIST = [
  /^ls(\s|$)/,
  /^cat\s/,
  /^head\s/,
  /^tail\s/,
  /^grep\s/,
  /^find\s.+(?<!-delete)\s*$/,
  /^wc\s/,
  /^node\s+--check\s/,
  /^psql\s+--version/,
  /^git\s+(log|diff|show|status|branch|ls-tree|ls-files)\s/,
  /^pwd$/,
  /^echo\s/,
];

const REPO_ROOT = process.cwd();

// ─── Helpers ───────────────────────────────────────────────────────────────

function setOutput(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  if (!f) return;
  fs.appendFileSync(f, `${key}=${value}\n`);
}

function isDeniedPath(p) {
  const rel = path.relative(REPO_ROOT, path.resolve(REPO_ROOT, p)).replaceAll('\\', '/');
  if (rel.startsWith('..')) return true;
  return DENY_WRITE_GLOBS.some((re) => re.test(rel));
}

function isShellAllowed(cmd) {
  const trimmed = cmd.trim();
  return SHELL_ALLOWLIST.some((re) => re.test(trimmed));
}

// ─── Tool implementations ──────────────────────────────────────────────────

const fileMods = new Set();

function toolReadFile({ path: p, max_lines = 500 }) {
  const abs = path.resolve(REPO_ROOT, p);
  if (!abs.startsWith(REPO_ROOT)) return { error: 'Path outside repo' };
  if (!fs.existsSync(abs)) return { error: `File not found: ${p}` };
  const content = fs.readFileSync(abs, 'utf8');
  const lines = content.split('\n').slice(0, max_lines);
  const truncated = content.split('\n').length > max_lines;
  return { content: lines.join('\n'), truncated, total_lines: content.split('\n').length };
}

function toolWriteFile({ path: p, content }) {
  if (isDeniedPath(p)) return { error: `Path is on deny-list: ${p}` };
  if (fileMods.size >= MAX_FILE_MODIFICATIONS && !fileMods.has(p)) {
    return { error: `File-modification limit reached (${MAX_FILE_MODIFICATIONS})` };
  }
  const abs = path.resolve(REPO_ROOT, p);
  if (!abs.startsWith(REPO_ROOT)) return { error: 'Path outside repo' };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  fileMods.add(p);
  return { ok: true, written_chars: content.length, total_modifications: fileMods.size };
}

function toolListDir({ path: p = '.' }) {
  const abs = path.resolve(REPO_ROOT, p);
  if (!abs.startsWith(REPO_ROOT)) return { error: 'Path outside repo' };
  if (!fs.existsSync(abs)) return { error: `Dir not found: ${p}` };
  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.git') && e.name !== 'node_modules')
    .map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`)
    .sort();
  return { entries };
}

function toolGrep({ pattern, path: p = '.', glob = '' }) {
  const args = ['-rn', '--max-count=50'];
  if (glob) args.push(`--include=${glob}`);
  args.push('-e', pattern, p);
  const result = spawnSync('grep', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000 });
  if (result.status > 1) return { error: `grep failed: ${result.stderr}` };
  const lines = (result.stdout || '').split('\n').filter(Boolean).slice(0, 50);
  return { matches: lines, truncated: lines.length === 50 };
}

function toolShell({ command }) {
  if (!isShellAllowed(command)) {
    return { error: `Command not in allowlist: ${command.slice(0, 80)}` };
  }
  const result = spawnSync('bash', ['-c', command], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000,
  });
  return {
    exit_code: result.status,
    stdout: (result.stdout || '').slice(0, 4000),
    stderr: (result.stderr || '').slice(0, 1000),
  };
}

// ─── Tool definitions for Claude ───────────────────────────────────────────

const TOOLS = [
  {
    name: 'read_file',
    description: 'Liest eine Datei aus dem Repo. Standardmaessig 500 Zeilen.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relativer Pfad' },
        max_lines: { type: 'number', description: 'Optional, default 500' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Schreibt/ueberschreibt eine Datei. Pfade auf Deny-Liste werden abgelehnt. Max 5 Modifikationen pro Lauf.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relativer Pfad' },
        content: { type: 'string', description: 'Vollstaendiger neuer Inhalt der Datei' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'Listet Verzeichnis-Inhalt.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Repo-relativer Pfad, default "."' } },
    },
  },
  {
    name: 'grep',
    description: 'Sucht Pattern im Repo (rekursiv). Max 50 Treffer.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex-Pattern' },
        path: { type: 'string', description: 'Suchverzeichnis, default "."' },
        glob: { type: 'string', description: 'Optional, z.B. "*.sql" oder "*.ts"' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'shell',
    description: 'Fuehrt einen Read-only-Shell-Befehl aus (Whitelist: ls, cat, head, tail, grep, find, wc, node --check, git log/diff/show/status, etc.).',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  {
    name: 'finish',
    description: 'Beendet den Lauf. Entweder mit erfolgreichem Fix (proposed_fix_summary) oder mit Verzicht (no_fix_reason).',
    input_schema: {
      type: 'object',
      properties: {
        proposed_fix_summary: { type: 'string', description: 'Kurze Beschreibung der Aenderungen wenn Fix erstellt' },
        no_fix_reason: { type: 'string', description: 'Falls kein Fix moeglich: warum (z.B. "Fehler liegt in Infrastructure ausserhalb des Repos")' },
      },
    },
  },
];

const TOOL_HANDLERS = {
  read_file: toolReadFile,
  write_file: toolWriteFile,
  list_dir: toolListDir,
  grep: toolGrep,
  shell: toolShell,
};

// ─── System prompt (cached) ────────────────────────────────────────────────

const SYSTEM = [
  {
    type: 'text',
    text: `Du bist der Auto-Fix-Bot fuer das propus-platform Repo. Bei einem fehlgeschlagenen Production-Deploy bekommst du den Failure-Log.

Aufgabe:
1. Analysiere den Deploy-Log um die Root-Cause zu finden.
2. Identifiziere die einzelne(n) Datei(en) im Repo die zu aendern sind.
3. Schreibe den Fix MINIMALISTISCH — nur was zwingend zur Behebung noetig ist.
4. Wenn der Fehler ausserhalb des Repos liegt (z.B. Infrastructure, fehlende Secrets) → finish mit no_fix_reason.

Stil:
- Konservativ. Lieber finish ohne Fix als spekulativ patchen.
- Keine Refactorings die nicht direkt zum Fix gehoeren.
- Bei SQL-Migrationen: verstehe was rueckwaerts-kompatibel ist (CREATE OR REPLACE VIEW erlaubt nur Spalten anhaengen, etc.).
- Bei TypeScript: passe nur die Datei mit dem Fehler an, nicht die ganze Type-Signatur-Kette.

Tool-Use-Loop:
- Du hast read_file, write_file, list_dir, grep, shell (read-only), finish.
- Beende IMMER mit finish.
- Maximal 20 Iterationen, max 5 Datei-Modifikationen.

Kontext der Architektur:
- Migrationen liegen in core/migrations/*.sql und booking/migrations/*.sql
- App-Code in app/src/, Backend in booking/, tours/, core/
- Deploy-Skript: scripts/deploy-remote.sh
- Migration-Runner: core/migrate.js

Sicherheit:
- Schreibe NIE in .env*, .github/workflows/*, secrets, Keys
- Schreibe NIE in node_modules/

Wenn du fertig bist, finish() aufrufen — Workflow erstellt dann automatisch einen PR aus deinen Aenderungen.`,
    cache_control: { type: 'ephemeral' },
  },
];

// ─── Main loop ─────────────────────────────────────────────────────────────

async function main() {
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueTitle = process.env.ISSUE_TITLE || '(no title)';
  const issueBody = process.env.ISSUE_BODY || '(no body)';
  const issueUrl = process.env.ISSUE_URL || '';

  console.log(`[auto-fix] Starting for issue #${issueNumber}: ${issueTitle}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    setOutput('reason', 'ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    {
      role: 'user',
      content: `Issue #${issueNumber}: ${issueTitle}\n\n${issueBody.slice(0, 12000)}`,
    },
  ];

  let iteration = 0;
  let finishReason = null;
  let finishSummary = null;

  while (iteration < MAX_ITERATIONS) {
    iteration += 1;
    console.log(`\n[auto-fix] Iteration ${iteration} ...`);

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      console.error(`[auto-fix] API error: ${err.message}`);
      setOutput('reason', `Anthropic API error: ${err.message.slice(0, 200)}`);
      process.exit(1);
    }

    const usage = response.usage || {};
    console.log(`  tokens: in=${usage.input_tokens} cached=${usage.cache_read_input_tokens || 0} out=${usage.output_tokens}`);

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      console.log('[auto-fix] Model produced no tool_use, exiting');
      finishReason = 'Model stopped without calling finish()';
      break;
    }

    const toolResults = [];
    for (const block of toolUses) {
      if (block.name === 'finish') {
        finishSummary = block.input?.proposed_fix_summary || null;
        finishReason = block.input?.no_fix_reason || null;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'finish acknowledged',
        });
        break;
      }
      const handler = TOOL_HANDLERS[block.name];
      if (!handler) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        continue;
      }
      let result;
      try {
        result = handler(block.input || {});
      } catch (err) {
        result = { error: err.message };
      }
      console.log(`  ${block.name}(${JSON.stringify(block.input).slice(0, 100)}) => ${JSON.stringify(result).slice(0, 200)}`);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 8000),
        is_error: !!result.error,
      });
    }

    messages.push({ role: 'user', content: toolResults });

    if (finishSummary || finishReason) break;
  }

  console.log(`\n[auto-fix] Loop done. Modifications: ${fileMods.size}. Finish: ${finishSummary ? 'fix' : 'no-fix'}`);

  // No fix produced
  if (!finishSummary || fileMods.size === 0) {
    const reason = finishReason || 'Model exited without applying fixes';
    console.log(`[auto-fix] No fix: ${reason}`);
    setOutput('reason', reason.slice(0, 500));
    return;
  }

  // Create branch + commit + PR
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branch = `claude/auto-fix-issue-${issueNumber}-${ts}`;

  try {
    execSync('git config user.email "auto-fix-bot@propus-platform"', { stdio: 'inherit' });
    execSync('git config user.name "Propus Auto-Fix Bot"', { stdio: 'inherit' });
    execSync(`git checkout -b ${branch}`, { stdio: 'inherit' });
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "fix(auto): ${issueTitle.replace(/"/g, "'").slice(0, 100)}\n\n${finishSummary.slice(0, 500)}\n\nAuto-generated by deploy-failure auto-fix bot.\nIssue: ${issueUrl}\nFiles modified: ${[...fileMods].join(', ')}"`, { stdio: 'inherit' });
    execSync(`git push -u origin ${branch}`, { stdio: 'inherit' });

    const prBody = `🤖 **Auto-Fix-Bot Vorschlag**\n\nFix für Issue #${issueNumber}: ${issueTitle}\n\n## Was der Bot getan hat\n\n${finishSummary}\n\n## Geaenderte Dateien (${fileMods.size})\n\n${[...fileMods].map((f) => `- \`${f}\``).join('\n')}\n\n## Wichtig\n\n- **Bitte review vor dem Merge.** Der Bot hat 20-Iterationen-Limit + Tool-Whitelist, aber Fehlentscheidungen sind moeglich.\n- Beim Merge wird der Deploy-Workflow automatisch wieder ausgeloest.\n- Wenn der Re-Deploy gruen ist, schliesst sich Issue #${issueNumber} automatisch.\n\nLinks: ${issueUrl}`;
    const prTitle = `fix(auto): ${issueTitle}`.slice(0, 100);
    const prResult = spawnSync('gh', ['pr', 'create', '--title', prTitle, '--body', prBody, '--label', 'auto-fix'], {
      cwd: REPO_ROOT, encoding: 'utf8',
    });
    const prUrl = (prResult.stdout || '').trim().split('\n').find((l) => l.startsWith('http'));
    if (!prUrl) {
      throw new Error(`gh pr create did not return URL: ${prResult.stderr}`);
    }
    console.log(`[auto-fix] PR created: ${prUrl}`);
    setOutput('pr_url', prUrl);
  } catch (err) {
    console.error(`[auto-fix] Failed to create PR: ${err.message}`);
    setOutput('reason', `git/pr creation failed: ${err.message.slice(0, 200)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[auto-fix] Fatal: ${err.stack || err.message}`);
  setOutput('reason', `fatal: ${err.message.slice(0, 200)}`);
  process.exit(1);
});
