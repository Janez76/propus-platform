import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getLinkMatterportCustomerDetail,
  getLinkMatterportCustomerSearch,
  getToursAdminLinkMatterport,
  postLinkMatterport,
  postLinkMatterportBatch,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkMatterportQueryKey } from "../../../lib/queryKeys";

function buildQs(sp: URLSearchParams) {
  const n = new URLSearchParams();
  ["q", "page", "sort", "order", "openSpaceId"].forEach((k) => {
    const v = sp.get(k);
    if (v) n.set(k, v);
  });
  return n.toString();
}

function matterportShowUrl(spaceId: string) {
  const id = spaceId.trim();
  return id ? `https://my.matterport.com/show/?m=${encodeURIComponent(id)}` : "";
}

export function ToursAdminLinkMatterportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listQuery = useMemo(() => buildQs(searchParams), [searchParams]);
  const qk = toursAdminLinkMatterportQueryKey(listQuery);
  const queryFn = useCallback(() => getToursAdminLinkMatterport(listQuery), [listQuery]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 20_000 });

  const [mpId, setMpId] = useState("");
  const [tourUrl, setTourUrl] = useState("");
  const [bezeichnung, setBezeichnung] = useState("");
  const [coreCustomerId, setCoreCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [debouncedCustomerQ, setDebouncedCustomerQ] = useState("");
  const [suggestions, setSuggestions] = useState<{
    companies: Record<string, unknown>[];
    contacts: Record<string, unknown>[];
  }>({ companies: [], contacts: [] });
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cannotAssign, setCannotAssign] = useState(false);
  const [archiveIt, setArchiveIt] = useState(true);
  const selectedLabelRef = useRef<string | null>(null);
  const appliedOpenSpaceIdRef = useRef<string | null>(null);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);

  const openSpaces = (data?.openSpaces as Record<string, unknown>[]) || [];
  const pagination = data?.pagination as Record<string, unknown> | undefined;
  const mpError = data?.mpError as string | null | undefined;
  const autoOpenSpace = data?.autoOpenSpace as Record<string, unknown> | null | undefined;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerQ(customerSearchDraft.trim()), 200);
    return () => clearTimeout(t);
  }, [customerSearchDraft]);

  useEffect(() => {
    if (debouncedCustomerQ.length < 2) {
      setSuggestions({ companies: [], contacts: [] });
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    void getLinkMatterportCustomerSearch(debouncedCustomerQ)
      .then((dataRes) => {
        if (cancelled) return;
        setSuggestions({
          companies: Array.isArray(dataRes.companies) ? (dataRes.companies as Record<string, unknown>[]) : [],
          contacts: Array.isArray(dataRes.contacts) ? (dataRes.contacts as Record<string, unknown>[]) : [],
        });
      })
      .catch(() => {
        if (!cancelled) setSuggestions({ companies: [], contacts: [] });
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedCustomerQ]);

  const openSpaceIdInUrl = searchParams.get("openSpaceId") || "";

  useEffect(() => {
    if (!openSpaceIdInUrl) {
      appliedOpenSpaceIdRef.current = null;
      return;
    }
    if (!autoOpenSpace?.id || String(autoOpenSpace.id) !== openSpaceIdInUrl) return;
    if (appliedOpenSpaceIdRef.current === openSpaceIdInUrl) return;
    appliedOpenSpaceIdRef.current = openSpaceIdInUrl;
    setMpId(openSpaceIdInUrl);
    setTourUrl(matterportShowUrl(openSpaceIdInUrl));
    setBezeichnung(String(autoOpenSpace.name || ""));
    setCannotAssign(false);
    setArchiveIt(true);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("openSpaceId");
        return n;
      },
      { replace: true }
    );
    queueMicrotask(() => formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openSpaceIdInUrl, autoOpenSpace, setSearchParams]);

  useEffect(() => {
    if (!cannotAssign) return;
    selectedLabelRef.current = null;
    setCoreCustomerId("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerContact("");
    setCustomerSearchDraft("");
    setSuggestions({ companies: [], contacts: [] });
  }, [cannotAssign]);

  function prefillFromSpace(m: Record<string, unknown>) {
    const id = String(m.id || "").trim();
    if (!id) return;
    setMpId(id);
    setTourUrl(matterportShowUrl(id));
    setBezeichnung(String(m.name || ""));
    setCannotAssign(false);
    setArchiveIt(true);
    queueMicrotask(() => formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function clearCustomerSelection() {
    selectedLabelRef.current = null;
    setCoreCustomerId("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerContact("");
    setCustomerSearchDraft("");
    setSuggestions({ companies: [], contacts: [] });
  }

  function pickCompany(c: Record<string, unknown>) {
    const id = c.id;
    setCoreCustomerId(id != null ? String(id) : "");
    setCustomerName(String(c.firmenname ?? ""));
    setCustomerEmail(String(c.email ?? ""));
    setCustomerContact("");
    const label = String(c.firmenname ?? id ?? "");
    selectedLabelRef.current = label;
    setCustomerSearchDraft(label);
    setSuggestions({ companies: [], contacts: [] });
  }

  async function pickContact(hit: Record<string, unknown>) {
    setCoreCustomerId(String(hit.customerId ?? ""));
    setCustomerName(String(hit.firmenname ?? ""));
    setCustomerEmail(String(hit.contactEmail ?? hit.customerEmail ?? ""));
    setCustomerContact(String(hit.contactName ?? ""));
    const label = `${String(hit.contactName || "").trim()} · ${String(hit.firmenname || "").trim()}`.trim() || String(hit.firmenname ?? "");
    selectedLabelRef.current = label;
    setCustomerSearchDraft(label);
    setSuggestions({ companies: [], contacts: [] });
    const cid = parseInt(String(hit.customerId ?? ""), 10);
    if (!Number.isFinite(cid) || cid < 1) return;
    try {
      const d = await getLinkMatterportCustomerDetail(cid);
      const cust = d.customer as Record<string, unknown> | null | undefined;
      if (cust) {
        setCustomerName(String(cust.firmenname ?? hit.firmenname ?? ""));
        setCustomerEmail(String(cust.email ?? hit.customerEmail ?? ""));
      }
    } catch {
      /* optional detail */
    }
  }

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (value == null || value === "") n.delete(key);
        else n.set(key, value);
        if (key !== "page") n.delete("page");
        return n;
      },
      { replace: true }
    );
  }

  async function runBatch(action: "auto" | "refresh-created" | "sync-status" | "check-ownership") {
    setBusy(action);
    try {
      await postLinkMatterportBatch(action);
      void refetch({ force: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(null);
    }
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!mpId.trim()) {
      alert("Matterport Space ID fehlt.");
      return;
    }
    if (!cannotAssign && !tourUrl.trim()) {
      alert("Tour-Link fehlt (oder Option „Kann nicht zugewiesen werden“ aktivieren).");
      return;
    }
    setBusy("link");
    try {
      const body: Record<string, unknown> = {
        matterportSpaceId: mpId.trim(),
        tourUrl: tourUrl.trim(),
        bezeichnung: bezeichnung.trim(),
      };
      if (cannotAssign) {
        body.cannotAssign = true;
        if (archiveIt) body.archiveIt = true;
      }
      if (!cannotAssign && coreCustomerId.trim()) body.coreCustomerId = coreCustomerId.trim();
      if (!cannotAssign && customerName.trim()) body.customerName = customerName.trim();
      if (!cannotAssign && customerEmail.trim()) body.customerEmail = customerEmail.trim();
      if (!cannotAssign && customerContact.trim()) body.customerContact = customerContact.trim();

      const r = await postLinkMatterport(body);
      if ((r as { ok?: boolean }).ok === false) {
        const dup = (r as { duplicateTourId?: number }).duplicateTourId;
        alert(dup ? `Duplikat – Tour #${dup}` : String((r as { error?: string }).error));
        return;
      }
      setMpId("");
      setTourUrl("");
      setBezeichnung("");
      setCannotAssign(false);
      setArchiveIt(true);
      clearCustomerSelection();
      appliedOpenSpaceIdRef.current = null;
      void refetch({ force: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(null);
    }
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const showSuggestPanel =
    debouncedCustomerQ.length >= 2 && (suggestLoading || suggestions.companies.length > 0 || suggestions.contacts.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Matterport verknüpfen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">Offene Spaces und Batch-Aktionen.</p>
        </div>
      </div>

      {mpError ? <p className="text-sm text-amber-700 dark:text-amber-400">Matterport API: {mpError}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} className="text-xs border rounded px-2 py-1" onClick={() => void runBatch("auto")}>
          {busy === "auto" ? "…" : "Auto-Link URLs"}
        </button>
        <button type="button" disabled={!!busy} className="text-xs border rounded px-2 py-1" onClick={() => void runBatch("refresh-created")}>
          {busy === "refresh-created" ? "…" : "MP created nachziehen"}
        </button>
        <button type="button" disabled={!!busy} className="text-xs border rounded px-2 py-1" onClick={() => void runBatch("sync-status")}>
          {busy === "sync-status" ? "…" : "Status sync"}
        </button>
        <button type="button" disabled={!!busy} className="text-xs border rounded px-2 py-1" onClick={() => void runBatch("check-ownership")}>
          {busy === "check-ownership" ? "…" : "Ownership prüfen"}
        </button>
      </div>

      <div ref={formAnchorRef} className="scroll-mt-4" />

      <form onSubmit={submitLink} className="surface-card-strong p-4 space-y-3 text-sm">
        <h2 className="font-semibold text-[var(--text-main)]">Neue Tour anlegen</h2>

        <div className="space-y-2 rounded-lg border border-[var(--border-soft)] p-3 bg-[var(--surface)]/50">
          <label className="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={cannotAssign}
              onChange={(e) => {
                const on = e.target.checked;
                setCannotAssign(on);
                if (on) setArchiveIt(true);
              }}
            />
            <span>Kann nicht zugewiesen werden</span>
          </label>
          {cannotAssign ? (
            <div className="ml-6 space-y-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={archiveIt} onChange={(e) => setArchiveIt(e.target.checked)} />
                <span>Archivieren</span>
              </label>
              <p className="text-xs text-amber-800 dark:text-amber-300 pl-6 leading-snug">
                Das Matterport-Modell wird dabei auf <strong>inaktiv</strong> gesetzt.
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input className="border rounded px-2 py-1 bg-[var(--surface)]" placeholder="Matterport Space ID" value={mpId} onChange={(e) => setMpId(e.target.value)} />
          <input
            className="border rounded px-2 py-1 bg-[var(--surface)]"
            placeholder={cannotAssign ? "Tour-URL (optional)" : "Tour-URL (my.matterport.com) *"}
            value={tourUrl}
            onChange={(e) => setTourUrl(e.target.value)}
          />
          <input className="border rounded px-2 py-1 bg-[var(--surface)] sm:col-span-2" placeholder="Bezeichnung / Objekt" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} />
        </div>

        {!cannotAssign ? (
        <>
        <div className="relative space-y-1">
          <label className="text-xs text-[var(--text-subtle)]">Kunde (Suche, min. 2 Zeichen)</label>
          <div className="flex flex-wrap gap-2">
            <input
              className="border rounded px-2 py-1 bg-[var(--surface)] flex-1 min-w-[200px]"
              placeholder="Firma, E-Mail, Kontakt…"
              value={customerSearchDraft}
              onChange={(e) => {
                const v = e.target.value;
                setCustomerSearchDraft(v);
                if (selectedLabelRef.current != null && v.trim() !== selectedLabelRef.current) {
                  selectedLabelRef.current = null;
                  setCoreCustomerId("");
                }
              }}
              autoComplete="off"
            />
            {(coreCustomerId || customerName) && (
              <button type="button" className="text-xs underline text-[var(--text-subtle)]" onClick={() => clearCustomerSelection()}>
                Kunde leeren
              </button>
            )}
          </div>
          {coreCustomerId ? (
            <p className="text-xs text-[var(--text-subtle)]">
              core.customers.id: <span className="font-mono text-[var(--text-main)]">{coreCustomerId}</span>
            </p>
          ) : null}
          {showSuggestPanel ? (
            <div className="absolute z-20 mt-1 w-full max-w-lg rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
              {suggestLoading ? (
                <p className="p-2 text-xs text-[var(--text-subtle)]">Suche…</p>
              ) : (
                <ul className="py-1 text-xs">
                  {suggestions.companies.map((c, idx) => (
                    <li key={`c-${String(c.id ?? idx)}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                        onClick={() => pickCompany(c)}
                      >
                        <span className="font-medium text-[var(--text-main)]">{String(c.firmenname ?? c.id ?? "—")}</span>
                        {c.nummer != null ? <span className="text-[var(--text-subtle)] ml-1">· Ref. {String(c.nummer)}</span> : null}
                      </button>
                    </li>
                  ))}
                  {suggestions.contacts.map((hit, idx) => (
                    <li key={`k-${String(hit.contactId ?? idx)}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)]"
                        onClick={() => void pickContact(hit)}
                      >
                        <span className="text-[var(--text-main)]">{String(hit.contactName || "—")}</span>
                        <span className="text-[var(--text-subtle)]"> · {String(hit.firmenname ?? "—")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <input className="border rounded px-2 py-1 bg-[var(--surface)]" placeholder="Kundenname (Anzeige)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="border rounded px-2 py-1 bg-[var(--surface)]" type="email" placeholder="E-Mail" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          <input className="border rounded px-2 py-1 bg-[var(--surface)]" placeholder="Ansprechpartner" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
        </div>
        </>
        ) : (
          <p className="text-xs text-[var(--text-subtle)]">Ohne Zuweisung werden keine Kundendaten gespeichert.</p>
        )}

        <button type="submit" disabled={!!busy} className="rounded bg-[var(--accent)] text-white px-3 py-1.5 text-xs">
          {busy === "link" ? "…" : "Anlegen"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="search"
          placeholder="Suche Name / ID…"
          defaultValue={searchParams.get("q") || ""}
          key={searchParams.get("q") || ""}
          className="border rounded px-2 py-1 text-sm flex-1 min-w-[200px] bg-[var(--surface)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim() || null);
          }}
        />
        <select
          value={searchParams.get("sort") || "space"}
          onChange={(e) => setParam("sort", e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-[var(--surface)]"
        >
          <option value="space">Sort: Name</option>
          <option value="created">Sort: Erstellt</option>
        </select>
        <select
          value={searchParams.get("order") || "asc"}
          onChange={(e) => setParam("order", e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-[var(--surface)]"
        >
          <option value="asc">Aufwärts</option>
          <option value="desc">Abwärts</option>
        </select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="surface-card-strong overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                <th className="px-4 py-2">Space</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Erstellt</th>
                <th className="px-4 py-2 w-36">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {openSpaces.map((m) => (
                <tr key={String(m.id)} className="border-b border-[var(--border-soft)]/40">
                  <td className="px-4 py-2">{String(m.name || "—")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{String(m.id)}</td>
                  <td className="px-4 py-2 text-xs text-[var(--text-subtle)]">{m.created ? String(m.created).slice(0, 10) : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="text-xs rounded border border-[var(--border-soft)] px-2 py-1 hover:bg-[var(--surface-raised)]"
                        onClick={() => prefillFromSpace(m)}
                      >
                        Übernehmen
                      </button>
                      <button
                        type="button"
                        className="text-xs rounded border border-[var(--border-soft)] px-2 py-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
                        title="Seite mit openSpaceId laden (wie EJS Deep-Link)"
                        onClick={() => {
                          setSearchParams(
                            (prev) => {
                              const n = new URLSearchParams(prev);
                              n.set("openSpaceId", String(m.id || ""));
                              n.delete("page");
                              return n;
                            },
                            { replace: true }
                          );
                        }}
                      >
                        Link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && Number(pagination.totalPages) > 1 ? (
            <div className="flex justify-between items-center px-4 py-2 text-xs text-[var(--text-subtle)]">
              <span>
                Seite {String(pagination.page)} / {String(pagination.totalPages)}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={!pagination.hasPrev} className="underline disabled:opacity-40" onClick={() => setParam("page", String(page - 1))}>
                  Zurück
                </button>
                <button type="button" disabled={!pagination.hasNext} className="underline disabled:opacity-40" onClick={() => setParam("page", String(page + 1))}>
                  Weiter
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
