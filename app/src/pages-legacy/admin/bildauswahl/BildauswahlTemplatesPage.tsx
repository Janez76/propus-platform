import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listBildauswahlEmailTemplates,
  saveBildauswahlEmailTemplate,
  type BildauswahlEmailTemplate,
} from "../../../api/bildauswahlAdmin";

const PLACEHOLDERS_HINT = `Verfügbare Platzhalter: {{gallery_link}} {{title}} {{customer_name}}
{{customer_name_line}} {{address}} {{order_no}} {{file_list}}
{{feedback_body}} {{customer_comment}} {{asset_label}} {{direct_link}} {{revision}}`;

export function BildauswahlTemplatesPage() {
  const [rows, setRows] = useState<BildauswahlEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBildauswahlEmailTemplates();
      setRows(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
        setSubject(data[0].subject);
        setBody(data[0].body);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void reload(); }, [reload]);

  const onSelect = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setSelectedId(id);
    setSubject(row.subject);
    setBody(row.body);
    setInfo(null);
    setErr(null);
  };

  const onSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setInfo(null);
    setErr(null);
    try {
      await saveBildauswahlEmailTemplate(selectedId, subject, body);
      setInfo("Gespeichert.");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const current = rows.find((r) => r.id === selectedId);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/admin/bildauswahl" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>← Bildauswahl</Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px" }}>E-Mail-Vorlagen</h1>

      {err && <div style={{ padding: 12, background: "#fee", border: "1px solid #fcc", borderRadius: 8, marginBottom: 12 }}>{err}</div>}
      {info && <div style={{ padding: 12, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, marginBottom: 12, color: "#166534" }}>{info}</div>}

      {loading ? <p style={{ color: "#666" }}>Lade …</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16 }}>
          <aside>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    textAlign: "left",
                    border: "1px solid " + (selectedId === r.id ? "#141414" : "#eee"),
                    background: selectedId === r.id ? "#141414" : "white",
                    color: selectedId === r.id ? "white" : "#333",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {r.name}
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, fontWeight: 400 }}>{r.id}</div>
                </button>
              ))}
            </div>
          </aside>
          {current ? (
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>Betreff</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>HTML-Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={20}
                  style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                />
              </div>
              <pre style={{ background: "#f9fafb", padding: 8, borderRadius: 6, fontSize: 11, color: "#666", margin: "0 0 12px" }}>{PLACEHOLDERS_HINT}</pre>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={onSave}
                  disabled={saving}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none",
                    background: "#141414", color: "white",
                    cursor: saving ? "wait" : "pointer", fontSize: 13,
                  }}
                >
                  {saving ? "Speichere …" : "Speichern"}
                </button>
                <div style={{ marginLeft: "auto", fontSize: 11, color: "#999" }}>
                  Aktualisiert: {new Date(current.updated_at).toLocaleString("de-CH")}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
