import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAdminLayoutSession } from "@/lib/auth.server";
import type { Role } from "@/types";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminLayoutSession();
  return (
    <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-hidden bg-[var(--bg-classic)] [--assistant-sidebar-offset:272px]">
      <AppSidebar initialRole={session.role as Role} />
      <main className="min-h-screen min-w-0 max-w-full overflow-x-hidden p-2 sm:p-3 lg:py-6 lg:pr-6 lg:pl-[calc(var(--assistant-sidebar-offset)+1.5rem)]">
        {children}
      </main>
    </div>
  );
}
