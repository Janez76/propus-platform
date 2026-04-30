import { ordersHandlers, ordersTools } from "./orders";
import { posteingangHandlers, posteingangTools } from "./posteingang";
import { toursHandlers, toursTools } from "./tours";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolContext = {
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
};

export type ToolHandler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const allTools: ToolDefinition[] = [...ordersTools, ...toursTools, ...posteingangTools];

export const allHandlers: Record<string, ToolHandler> = {
  ...ordersHandlers,
  ...toursHandlers,
  ...posteingangHandlers,
};
