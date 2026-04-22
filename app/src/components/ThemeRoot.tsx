"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { applyTheme } from "@/store/themeStore";
import { ImpersonationHandshake } from "@/components/auth/ImpersonationHandshake";
import { ImpersonateBanner } from "@/components/auth/ImpersonateBanner";

/**
 * Re-applies the stored theme to <html> after React hydration.
 * Without this, Next.js overwrites document.documentElement.className from
 * RootLayout and drops the `dark` class that the inline script added — and
 * routes without Topbar (e.g. /login) never import themeStore, so dark mode
 * would stay broken until navigation.
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    applyTheme();
  }, []);

  return (
    <>
      <ImpersonationHandshake />
      <ImpersonateBanner />
      {children}
    </>
  );
}
