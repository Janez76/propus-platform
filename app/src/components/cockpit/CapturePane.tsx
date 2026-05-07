'use client';

import { useEffect, useState } from 'react';
import { Save, Plus, Loader2, Trash2 } from 'lucide-react';
import './cockpit-panes.css';

interface MemoryRow {
  id: string;
  body: string;
  created_at?: string;
  source?: string;
  expires_at?: string | null;
}

export function CapturePane() {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<MemoryRow[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const loadRecent = async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/assistant/memories', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; memories?: MemoryRow[] };
      setRecent((data.memories ?? []).slice(0, 5));
    } catch {
      setRecent([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadRecent();
  }, []);

  const handleSave = async () => {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/assistant/memories', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `HTTP ${res.status}`);
      }
      setText('');
      void loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/assistant/memories/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) return;
      setRecent((prev) => prev?.filter((m) => m.id !== id) ?? null);
    } catch {
      /* silent */
    }
  };

  return (
    <div className="propus-pane-stack">
      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <Plus size={12} aria-hidden /> Schnell festhalten
        </h5>
        <div className="propus-capture-form">
          <textarea
            className="propus-capture-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="Idee, Notiz, Termin-Hinweis … Cmd/Ctrl+Enter speichert direkt."
            rows={4}
            maxLength={2000}
            aria-label="Notiz"
            disabled={saving}
          />
          <div className="propus-capture-foot">
            <span className="propus-capture-counter">{text.length} / 2000</span>
            <button
              type="button"
              className="propus-capture-save"
              onClick={() => void handleSave()}
              disabled={!text.trim() || saving}
            >
              {saving ? <Loader2 size={12} className="propus-briefing-spin" /> : <Save size={12} />}
              <span>Als Memory speichern</span>
            </button>
          </div>
          {error && (
            <div className="propus-pane-error" role="alert">{error}</div>
          )}
        </div>
      </section>

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">Letzte Memories</h5>
        {loadingList && <div className="propus-pane-empty"><div className="propus-pane-empty-sub">Lade …</div></div>}
        {!loadingList && (recent?.length ?? 0) === 0 && (
          <div className="propus-pane-empty">
            <div className="propus-pane-empty-title">Noch nichts</div>
            <div className="propus-pane-empty-sub">Deine ersten Notizen erscheinen hier.</div>
          </div>
        )}
        {recent && recent.length > 0 && (
          <ul className="propus-memory-list">
            {recent.map((m) => (
              <li key={m.id} className="propus-memory-row">
                <span className="propus-memory-body">{m.body}</span>
                <button
                  type="button"
                  className="propus-memory-del"
                  onClick={() => void handleDelete(m.id)}
                  aria-label="Löschen"
                  title="Memory löschen"
                >
                  <Trash2 size={11} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
