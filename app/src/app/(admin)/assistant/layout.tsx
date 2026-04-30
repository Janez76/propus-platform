import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAdminLayoutSession } from "@/lib/auth.server";
import type { Role } from "@/types";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminLayoutSession();
  return (
    <div className="flex min-h-screen bg-[var(--surface)]">
      <AppSidebar initialRole={session.role as Role} />
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</main>
    </div>
  );
}
