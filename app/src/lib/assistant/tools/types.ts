import type { AssistantLiveLocation } from "../live-location-types";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  kind?: "read" | "write";
  requiresConfirmation?: boolean;
};

export type ToolContext = {
  userId: string;
  userEmail: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
  /** Aktuelle Assistant-Konversation (falls schon angelegt) */
  conversationId?: string;
  /** Pro Anfrage: geteilter Gerätestandort für Routing-Tools (optional). */
  liveLocation?: AssistantLiveLocation | null;
};

export type ToolHandler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
