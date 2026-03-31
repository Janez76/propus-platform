/**
 * Catch-all page that mounts the React SPA (ClientShell).
 *
 * All non-API routes are handled by the React Router-based ClientShell.
 * This enables a clean migration path: individual routes can be converted
 * to Next.js Server Components by creating specific page.tsx files.
 */
import ClientShellLoader from "@/components/ClientShellLoader";

export default function SpaPage() {
  return <ClientShellLoader />;
}
