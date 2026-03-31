/**
 * Catch-all page that mounts the React SPA (ClientShell).
 *
 * All non-API routes are handled by the React Router-based ClientShell.
 * This enables a clean migration path: individual routes can be converted
 * to Next.js Server Components by creating specific page.tsx files.
 */
import dynamic from "next/dynamic";

const ClientShell = dynamic(() => import("@/components/ClientShell"), {
  ssr: false,
});

export default function SpaPage() {
  return <ClientShell />;
}
