/**
 * Tool-Registry — sammelt alle Tools und exportiert sie.
 * Definiert auch die gemeinsamen Typen.
 */

import { ordersTools, ordersHandlers } from './orders';
import { calendarTools, calendarHandlers } from './calendar';
import { emailTools, emailHandlers } from './email';
import { toursTools, toursHandlers } from './tours';
import { mailerliteTools, mailerliteHandlers } from './mailerlite';
import { homeAssistantTools, homeAssistantHandlers } from './home-assistant';
import { paperlessTools, paperlessHandlers } from './paperless';

export interface ToolContext {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
  /** Optional: SQL-Connection oder ORM-Instanz, je nach Setup einsetzen */
  db?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

export const allTools: ToolDefinition[] = [
  ...ordersTools,
  ...calendarTools,
  ...emailTools,
  ...toursTools,
  ...mailerliteTools,
  ...homeAssistantTools,
  ...paperlessTools,
];

export const allHandlers: Record<string, ToolHandler> = {
  ...ordersHandlers,
  ...calendarHandlers,
  ...emailHandlers,
  ...toursHandlers,
  ...mailerliteHandlers,
  ...homeAssistantHandlers,
  ...paperlessHandlers,
};
