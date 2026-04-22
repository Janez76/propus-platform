import type { PropsWithChildren } from "react";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { cn } from "../../lib/utils";

export function AppShell({ children }: PropsWithChildren) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: "var(--bg-classic)" }}>
      <Sidebar
        onOpenCmdk={() => {
          // TODO: Cmd+K-Befehlspalette (eigener PR)
          console.log("TODO: Cmd+K Palette");
        }}
      />

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
        />
      )}
    </div>
  );
}

