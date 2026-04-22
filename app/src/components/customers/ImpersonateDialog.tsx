"use client";

import { useCallback, useEffect, useState } from "react";
import type { Customer } from "@/api/customers";
import { impersonateCustomerPanel, listCustomerTeamMembers, type ImpersonatePanelBody } from "@/api/customers";
import { useAuthStore } from "@/store/authStore";
import { t } from "@/i18n";
import { X } from "lucide-react";

const ROLES: { value: ImpersonatePanelBody["role"]; label: string; hint: string }[] = [
  { value: "customer_admin", label: "Kunden-Admin", hint: "Typische Sicht: Team & Bestellungen verwalten" },
  { value: "customer_user", label: "Kunden-Benutzer", hint: "Typische Sicht: Lesen" },
  { value: "tour_manager", label: "Tour-Manager", hint: "Interne Sicht laut Zuteilung (Vorsicht)" },
];

type Props = {
  token: string;
  item: Customer;
  onClose: () => void;
};

export function ImpersonateDialog({ token, item, onClose }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const [role, setRole] = useState<ImpersonatePanelBody["role"]>("customer_user");
  const [memberValue, setMemberValue] = useState<"owner" | string>("owner");
  const [members, setMembers] = useState<{ email: string; displayName: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await listCustomerTeamMembers(token, item.id);
        if (!cancelled) {
          setMembers(
            (r?.members || []).map((m) => ({
              email: m.email,
              displayName: m.displayName,
              status: m.status,
            })),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : t(lang, "common.error"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, lang, token]);

  const submit = useCallback(async () => {
    setErr("");
    setSubmitting(true);
    try {
      const memberEmail = memberValue === "owner" ? undefined : String(memberValue).toLowerCase();
      const { url } = await impersonateCustomerPanel(token, item.id, { role, memberEmail });
      const u = String(url || "").trim();
      if (!u) throw new Error("Keine URL");
      const w = window.open("about:blank", "_blank");
      if (w) {
        w.opener = null;
        w.location.href = u;
      } else {
        window.open(u, "_blank");
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t(lang, "common.error"));
    } finally {
      setSubmitting(false);
    }
  }, [item.id, lang, memberValue, onClose, role, token]);

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="imp-title">
      <div className="surface-card w-full max-w-md rounded-lg border border-zinc-200 p-4 shadow-lg dark:border-zinc-600">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id="imp-title" className="text-lg font-semibold">
            {t(lang, "impersonate.title")}
          </h2>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClose} aria-label={t(lang, "common.cancel")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t(lang, "impersonate.hint")}{" "}
          <code className="text-xs text-zinc-800 dark:text-zinc-200">{String(item.email || "—")}</code>
        </p>

        {loading ? <p className="text-sm text-zinc-500">{t(lang, "common.loading")}</p> : null}

        <div className="mb-3 space-y-2">
          <div className="text-xs font-semibold uppercase text-zinc-500">{t(lang, "impersonate.role")}</div>
          {ROLES.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded border border-zinc-200/80 p-2 text-sm dark:border-zinc-600/80">
              <input
                type="radio"
                name="impRole"
                checked={role === o.value}
                onChange={() => {
                  setRole(o.value);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="ml-1 block text-xs text-zinc-500">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">{t(lang, "impersonate.member")}</label>
          <select
            className="ui-input w-full"
            value={memberValue}
            onChange={(e) => {
              setMemberValue(e.target.value);
            }}
            disabled={loading}
          >
            <option value="owner">Inhaber / {String(item.email || t(lang, "common.email"))}</option>
            {members.map((m) => (
              <option key={m.email} value={m.email}>
                {m.displayName ? `${m.displayName} · ` : ""}
                {m.email} ({m.status})
              </option>
            ))}
          </select>
        </div>

        {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={uiMode === "modern" ? "btn-secondary" : "rounded border px-3 py-1.5 text-sm"} onClick={onClose} disabled={submitting}>
            {t(lang, "common.cancel")}
          </button>
          <button
            type="button"
            className={uiMode === "modern" ? "btn-primary" : "rounded border border-(--accent) bg-(--accent) px-3 py-1.5 text-sm text-white disabled:opacity-50"}
            disabled={item.blocked || loading || submitting}
            onClick={() => {
              void submit();
            }}
          >
            {submitting ? t(lang, "common.loading") : t(lang, "impersonate.open")}
          </button>
        </div>
        {item.blocked ? <p className="mt-2 text-xs text-red-600">{t(lang, "impersonate.blocked")}</p> : null}
      </div>
    </div>
  );
}
