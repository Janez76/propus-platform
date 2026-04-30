import type { Metadata } from "next";
import { ConversationView } from "./_components/ConversationView";

export const metadata: Metadata = {
  title: "Assistant - Propus",
};

export default function AssistantPage() {
  return <ConversationView />;
}
