import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  adminBildauswahlThumbUrl,
  browseBildauswahlNas,
  deleteBildauswahl,
  getBildauswahl,
  importBildauswahlFromNas,
  markBildauswahlEmailSent,
  updateBildauswahl,
  type BildauswahlImage,
  type BildauswahlNasContext,
  type BildauswahlRow,
} from "../../../api/bildauswahlAdmin";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
  catch { return iso; }
}

function publicBildauswahlUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "")
    || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/bildauswahl/${encodeURIComponent(slug)}`;
}

export function BildauswahlEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<BildauswahlRow | null>(null);
  const [images, setImages] = useState<BildauswahlImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await getBildauswahl(id);
      setGallery(d.gallery);
      setImages(d.images);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  const onPatch = async (patch: Partial<BildauswahlRow>) => {
    if (!id) return;
    try {
      const g = await updateBildauswahl(id, patch);
      setGallery(g);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!id || !gallery) return;
    if (!window.confirm(`«${gallery.title}» wirklich löschen?`)) return;
    try {
      await deleteBildauswahl(id);
      navigate("/admin/bildauswahl");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onImportNas = async (source: { rootKind: "customer" | "raw"; relativePath: string }) => {
    if (!id) return;
    setImporting(true);
    setErr(null);
    setInfo(null);
    try {
      const r = await importBildauswahlFromNas(id, { ...source, storageSourceType: "nas_browser" });
      setInfo(`${r.added} Bild(er) importiert.`);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const onMarkSent = async () => {
    if (!id) return;
    try {
      await markBildauswahlEmailSent(id);
      await reload();
      setInfo("Als versendet markiert.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Lade …</div>;
  if (!gallery) return <div style={{ padding: 24 }}>Bildauswahl nicht gefunden. <Link to="/admin/bildauswahl">Zurück</Link></div>;

  const publicUrl = publicBildauswahlUrl(gallery.slug);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/admin/bildauswahl" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>← Bildauswahl</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 4px" }}>{gallery.title || "(Ohne Titel)"}</h1>
          <div style={{ color: "#999", fontSize: 13 }}>Slug: <code>{gallery.slug}</code></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ddd", textDecoration: "none", color: "#333", fontSize: 13 }}
          >
            Vorschau ↗
          </a>
          <button
            onClick={onDelete}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fcc", background: "#fff5f5", color: "#c00", cursor: "pointer", fontSize: 13 }}
          >
            Löschen
          </button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "#fee", border: "1px solid #fcc", borderRadius: 8, marginBottom: 12 }}>{err}</div>}
      {info && <div style={{ padding: 12, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, marginBottom: 12, color: "#166534" }}>{info}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
        <div>
          <section style={{ marginBottom: 24, background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Stammdaten</h2>
            <Field label="Titel" value={gallery.title} onSave={(v) => onPatch({ title: v })} />
            <Field label="Adresse" value={gallery.address} onSave={(v) => onPatch({ address: v || null })} />
            <Field label="Kunde (Name)" value={gallery.client_name} onSave={(v) => onPatch({ client_name: v || null })} />
            <Field label="Kunden-E-Mail" value={gallery.client_email} onSave={(v) => onPatch({ client_email: v || null })} />
            <Field
              label="Bestell-Nr"
              value={gallery.booking_order_no?.toString() ?? null}
              onSave={(v) => {
                const n = v ? Number.parseInt(v, 10) : null;
                onPatch({ booking_order_no: Number.isFinite(n) ? n : null });
              }}
              hint="Verknüpfte Bestell-Nr (Auto-Vorschlag beim NAS-Pick)"
            />
            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={gallery.status === "active"}
                  onChange={(e) => onPatch({ status: e.target.checked ? "active" : "inactive" })}
                />
                Aktiv (Kundenseite erreichbar)
              </label>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={gallery.watermark_enabled}
                  onChange={(e) => onPatch({ watermark_enabled: e.target.checked })}
                />
                Wasserzeichen
              </label>
            </div>
          </section>

          <section style={{ marginBottom: 24, background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>NAS-Quelle</h2>
            {gallery.storage_relative_path ? (
              <div style={{ marginBottom: 12, padding: 8, background: "#f9fafb", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}>
                {gallery.storage_root_kind}: /{gallery.storage_relative_path}
              </div>
            ) : null}
            <NasPicker
              onImport={onImportNas}
              importing={importing}
              onOrderGuess={(orderGuess) => {
                if (orderGuess && !gallery.booking_order_no) {
                  void onPatch({ booking_order_no: orderGuess });
                }
              }}
            />
          </section>

          <section style={{ background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
              Bilder ({images.length})
            </h2>
            {images.length === 0 ? (
              <p style={{ color: "#999", fontSize: 13 }}>Keine Bilder — wähle oben einen NAS-Ordner und klicke «Importieren».</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {images.map((img) => (
                  <div key={img.id} style={{ position: "relative", aspectRatio: "4 / 3", background: "#f4f4f5", borderRadius: 6, overflow: "hidden" }}>
                    {img.source_type === "nas_local" ? (
                      <img
                        src={adminBildauswahlThumbUrl(gallery.id, img.id, 400)}
                        alt={img.file_name || ""}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 12 }}>
                        {img.file_name || "Bild"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside>
          <section style={{ background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Versand & Logs</h2>
            <div style={{ fontSize: 13 }}>
              <LogRow label="Status" value={gallery.client_delivery_status === "sent" ? "Versendet" : "Offen"} />
              <LogRow label="Versendet am" value={fmt(gallery.client_delivery_sent_at)} />
              <LogRow label="Galerie geöffnet" value={fmt(gallery.client_log_gallery_opened_at)} />
              <LogRow label="Auswahl gesendet" value={fmt(gallery.client_log_selection_sent_at)} />
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <a
                href={`mailto:${encodeURIComponent(gallery.client_email || "")}?subject=${encodeURIComponent(`Ihre Bildauswahl – ${gallery.title}`)}&body=${encodeURIComponent(`Hallo,\n\nIhre Bildauswahl liegt bereit:\n${publicUrl}\n\nFreundliche Grüsse\nPropus`)}`}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #141414", background: "#141414", color: "white", textDecoration: "none", fontSize: 13, textAlign: "center" }}
              >
                E-Mail an Kunden öffnen
              </a>
              {gallery.client_delivery_status !== "sent" ? (
                <button
                  onClick={onMarkSent}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: 13 }}
                >
                  Als versendet markieren
                </button>
              ) : null}
            </div>
          </section>

          <section style={{ background: "white", border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Kunden-Link</h2>
            <input
              readOnly
              value={publicUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: "100%", padding: 8, fontFamily: "monospace", fontSize: 12, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label, value, onSave, hint,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => void;
  hint?: string;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</label>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? "")) onSave(v); }}
        style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
      />
      {hint ? <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function LogRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f4f4f5" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function NasPicker({
  onImport,
  importing,
  onOrderGuess,
}: {
  onImport: (s: { rootKind: "customer" | "raw"; relativePath: string }) => void | Promise<void>;
  importing: boolean;
  onOrderGuess: (n: number | null) => void;
}) {
  const [rootKind, setRootKind] = useState<"customer" | "raw">("customer");
  const [ctx, setCtx] = useState<BildauswahlNasContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (kind: "customer" | "raw", rel: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await browseBildauswahlNas(kind, rel);
      setCtx(r);
      onOrderGuess(r.orderGuess);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setCtx(null);
    } finally {
      setBusy(false);
    }
  }, [onOrderGuess]);

  useEffect(() => { void load(rootKind, ""); }, [rootKind, load]);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["customer", "raw"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRootKind(r)}
            style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer",
              border: "1px solid " + (rootKind === r ? "#141414" : "#ddd"),
              background: rootKind === r ? "#141414" : "white",
              color: rootKind === r ? "white" : "#333",
            }}
          >
            {r === "customer" ? "Kunden-Root" : "Raw-Root"}
          </button>
        ))}
      </div>
      {err && <div style={{ padding: 8, background: "#fee", borderRadius: 6, fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {ctx ? (
        <>
          <div style={{ fontFamily: "monospace", fontSize: 12, padding: 6, background: "#f9fafb", borderRadius: 4, marginBottom: 8 }}>
            /{ctx.currentRelativePath || ""}
          </div>
          {ctx.parentRelativePath !== null ? (
            <button
              onClick={() => load(rootKind, ctx.parentRelativePath || "")}
              style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, background: "white", cursor: "pointer", marginBottom: 4 }}
            >
              ↑ Eltern-Ordner
            </button>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
            {ctx.entries.length === 0 ? (
              <div style={{ color: "#999", fontSize: 12, padding: 4 }}>Keine Unterordner.</div>
            ) : (
              ctx.entries.map((e) => (
                <button
                  key={e.relativePath}
                  onClick={() => load(rootKind, e.relativePath)}
                  style={{ padding: "4px 8px", textAlign: "left", border: "1px solid #f4f4f5", borderRadius: 4, background: "white", cursor: "pointer", fontSize: 13 }}
                >
                  📁 {e.name}
                </button>
              ))
            )}
          </div>
          <div style={{ marginTop: 12, padding: 10, background: "#f9fafb", borderRadius: 6, fontSize: 12 }}>
            <div style={{ marginBottom: 6 }}>
              Aktueller Pfad enthält: <strong>{ctx.mediaSummary.images}</strong> Bild(er)
              {ctx.orderGuess ? <span> · vermutete Bestell-Nr: <strong>{ctx.orderGuess}</strong></span> : null}
            </div>
            <button
              onClick={() => onImport({ rootKind, relativePath: ctx.currentRelativePath })}
              disabled={importing || busy || ctx.mediaSummary.images === 0 || !ctx.currentRelativePath}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: "#141414", color: "white", cursor: importing ? "wait" : "pointer", fontSize: 13,
                opacity: ctx.mediaSummary.images === 0 || !ctx.currentRelativePath ? 0.5 : 1,
              }}
            >
              {importing ? "Importiere …" : `${ctx.mediaSummary.images} Bild(er) übernehmen`}
            </button>
          </div>
        </>
      ) : busy ? (
        <div style={{ color: "#999", fontSize: 12 }}>Lade …</div>
      ) : null}
    </div>
  );
}
