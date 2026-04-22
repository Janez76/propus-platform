import type { ReactNode } from "react";
import { requireAdminLayoutSession } from "@/lib/auth.server";

export default async function AdminGroupLayout({ children }: { children: ReactNode }) {
  await requireAdminLayoutSession();
  return <>{children}</>;
}
