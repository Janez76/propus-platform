import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createBildauswahl,
  deleteBildauswahl,
  listBildauswahl,
  type BildauswahlListRow,
} from "../../../api/bildauswahlAdmin";

const FILTERS = [
  { value: "all", label: "Alle" },
  { value: "delivery_open", label: "Offen" },
  { value: "delivery_sent", label: "Versendet" },
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Deaktiviert" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

function fmt(iso: string): string {
  try { return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(iso)); }
  catch { return iso; }
}

export function BildauswahlListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BildauswahlListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listBildauswahl({
        search: search.trim() || undefined,
        filter: filter === "all" ? undefined : filter,
      });
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => { void reload(); }, [reload]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const g = await createBildauswahl({ title: "Neue Bildauswahl" });
      navigate(`/admin/bildauswahl/${g.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string, title: string) => {
    if (!window.confirm(`«${title}» wirklich löschen?`)) return;
    try {
      await deleteBildauswahl(id);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Bildauswahl</h1>
        <button
          onClick={onCreate}
          disabled={creating}
          style={{
            padding: "8px 16px", borderRadius: 8, background: "#141414", color: "white",
            border: "none", fontWeight: 500, cursor: creating ? "wait" : "pointer",
          }}
        >
          {creating ? "…" : "+ Neue Bildauswahl"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Suche Titel, Adresse, Kunde, Bestell-Nr …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 280px", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                border: "1px solid " + (filter === f.value ? "#141414" : "#ddd"),
                background: filter === f.value ? "#141414" : "white",
                color: filter === f.value ? "white" : "#333",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div style={{ padding: 12, background: "#fee", border: "1px solid #fcc", borderRadius: 8, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#666" }}>Lade …</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#666" }}>Keine Bildauswahl-Galerien vorhanden.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>Titel</th>
              <th style={{ padding: "8px 6px" }}>Kunde</th>
              <th style={{ padding: "8px 6px" }}>Bestell-Nr</th>
              <th style={{ padding: "8px 6px" }}>Bilder</th>
              <th style={{ padding: "8px 6px" }}>Status</th>
              <th style={{ padding: "8px 6px" }}>Versand</th>
              <th style={{ padding: "8px 6px" }}>Aktualisiert</th>
              <th style={{ padding: "8px 6px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 6px" }}>
                  <Link to={`/admin/bildauswahl/${r.id}`} style={{ color: "#185fa5", textDecoration: "none", fontWeight: 500 }}>
                    {r.title || "(Ohne Titel)"}
                  </Link>
                  {r.address ? <div style={{ color: "#999", fontSize: 12 }}>{r.address}</div> : null}
                </td>
                <td style={{ padding: "8px 6px" }}>{r.client_name || "—"}</td>
                <td style={{ padding: "8px 6px" }}>{r.booking_order_no ?? "—"}</td>
                <td style={{ padding: "8px 6px" }}>{r.image_count}</td>
                <td style={{ padding: "8px 6px" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 12,
                    background: r.status === "active" ? "#dcfce7" : "#f3f4f6",
                    color: r.status === "active" ? "#166534" : "#666",
                  }}>{r.status === "active" ? "Aktiv" : "Inaktiv"}</span>
                </td>
                <td style={{ padding: "8px 6px" }}>
                  {r.client_delivery_status === "sent" ? "✓" : "—"}
                </td>
                <td style={{ padding: "8px 6px", color: "#999" }}>{fmt(r.updated_at)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>
                  <button
                    onClick={() => onDelete(r.id, r.title)}
                    style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", fontSize: 13 }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
