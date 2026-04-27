import { LogOut, Monitor } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { API_BASE } from "../../api/client";

export function MobileHeader({ title }: { title: string }) {
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleLogout = () => {
    clearAuth();
    const redirect = encodeURIComponent(
      new URL(process.env.NEXT_PUBLIC_BASE_URL || "/", window.location.origin).toString(),
    );
    window.location.href = `${API_BASE}/auth/logout?redirect=${redirect}`;
  };

  const handleDesktop = () => {
    window.location.href = "/dashboard";
  };

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div className="flex items-center gap-2">
        <img src="/assets/brand/logopropus.png" alt="Propus" className="h-7 w-auto" />
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDesktop}
          aria-label="Desktop-Ansicht"
          title="Desktop-Ansicht"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
          style={{ color: "var(--text-muted)" }}
        >
          <Monitor className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Abmelden"
          title="Abmelden"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg"
          style={{ color: "var(--text-muted)" }}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
