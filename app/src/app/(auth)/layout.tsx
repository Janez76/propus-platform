import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — Propus Platform",
    default: "Anmeldung — Propus Platform",
  },
};

/**
 * Layout für die Auth-Route-Group.
 * Kein Sidebar, kein Admin-Chrome — die Login-Seite rendert vollflächig.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
