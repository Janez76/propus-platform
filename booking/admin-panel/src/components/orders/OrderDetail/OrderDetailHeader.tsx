import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { t, type Lang } from "../../../i18n";
import { StatusBadge } from "../../ui/StatusBadge";

type MenuItem = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type Props = {
  orderNo: string;
  status: string;
  lang: Lang;
  uiMode: string;
  statusDirty: boolean;
  savedOk: boolean;
  busy: string;
  onSave: () => void;
  onClose: () => void;
  menuItems: MenuItem[];
};

export function OrderDetailHeader({
  orderNo,
  status,
  lang,
  uiMode,
  statusDirty,
  savedOk,
  busy,
  onSave,
  onClose,
  menuItems,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const modern = uiMode === "modern";
  const secondaryClass = modern ? "btn-secondary" : "rounded border px-2 py-1 text-sm";
  const primaryClass = modern ? "btn-primary" : "rounded border px-3 py-1 text-sm font-semibold";

  const title = t(lang, "orderDetail.title").replace("{{orderNo}}", orderNo);

  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">{title}</h3>
        <StatusBadge status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {statusDirty && (
          <button
            className={primaryClass}
            disabled={busy === "save"}
            onClick={onSave}
          >
            {busy === "save" ? t(lang, "common.saving") : t(lang, "orderDetail.button.saveChanges")}
          </button>
        )}
        {savedOk && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t(lang, "common.saved")}
          </span>
        )}
        {menuItems.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label={t(lang, "common.moreActions")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`${secondaryClass} inline-flex items-center justify-center px-2`}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg"
              >
                {menuItems.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-50 ${item.destructive ? "text-red-500 hover:bg-red-500/10" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className={secondaryClass} onClick={onClose}>
          {t(lang, "common.close")}
        </button>
      </div>
    </div>
  );
}
