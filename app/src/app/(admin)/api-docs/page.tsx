import type { Metadata } from "next";
import { SwaggerUIPanel } from "./_components/SwaggerUIPanel";

export const metadata: Metadata = {
  title: "API-Docs - Propus",
};

export default function ApiDocsPage() {
  return <SwaggerUIPanel />;
}
