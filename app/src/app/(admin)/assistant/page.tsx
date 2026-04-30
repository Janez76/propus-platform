/**
 * Admin-Route: /assistant
 *
 * Sprachgestützter Assistent für Propus.
 */

import { ConversationView } from './_components/ConversationView';

export const metadata = {
  title: 'Assistant — Propus',
};

export default function AssistantPage() {
  return <ConversationView />;
}
