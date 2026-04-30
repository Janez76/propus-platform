import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAdminLayoutSession } from "@/lib/auth.server";
import type { Role } from "@/types";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminLayoutSession();
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <AppSidebar initialRole={session.role as Role} />
      <main className="min-h-screen min-w-0 p-3 lg:py-6 lg:pr-6 lg:pl-[calc(272px+1.5rem)]">{children}</main>
    </div>
  );
}
