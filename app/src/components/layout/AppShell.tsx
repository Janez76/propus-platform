import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { SearchPalette } from "../search/SearchPalette";
import { cn } from "../../lib/utils";

export function AppShell({ children }: PropsWithChildren) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: "var(--bg-classic)" }}>
      <Sidebar
        onOpenCmdk={() => setIsSearchOpen(true)}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />
      <SearchPalette open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        <Topbar onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />

        <main className={cn(
          "flex-1 px-4 py-6 sm:px-6 lg:px-8",
          "pb-20 lg:pb-6"
        )}>
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>

        <Footer />
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-20"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

