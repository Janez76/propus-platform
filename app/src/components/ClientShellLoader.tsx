"use client";

import dynamic from "next/dynamic";

const ClientShell = dynamic(() => import("@/components/ClientShell"), {
  ssr: false,
});

export default function ClientShellLoader() {
  return <ClientShell />;
}
