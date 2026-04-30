import { customersHandlers, customersTools } from "./customers";
import { databaseHandlers, databaseTools } from "./database";
import { designsHandlers, designsTools } from "./designs";
import { emailHandlers, emailTools } from "./email";
import { invoicesHandlers, invoicesTools } from "./invoices";
import { ordersHandlers, ordersTools } from "./orders";
import { posteingangHandlers, posteingangTools } from "./posteingang";
import { toursHandlers, toursTools } from "./tours";
import { writeTools, writeHandlers } from "./writes";

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
};

export type ToolHandler = (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const allTools: ToolDefinition[] = [
  ...ordersTools,
  ...toursTools,
  ...invoicesTools,
  ...posteingangTools,
  ...customersTools,
  ...emailTools,
  ...designsTools,
  ...databaseTools,
  ...writeTools,
];

export const allHandlers: Record<string, ToolHandler> = {
  ...ordersHandlers,
  ...toursHandlers,
  ...invoicesHandlers,
  ...posteingangHandlers,
  ...customersHandlers,
  ...emailHandlers,
  ...designsHandlers,
  ...databaseHandlers,
  ...writeHandlers,
};

function toAnthropicInputSchema(input_schema: ToolDefinition["input_schema"]): ToolDefinition["input_schema"] {
  const { type, properties, required } = input_schema;
  return {
    type,
    ...(properties ? { properties } : {}),
    ...(required ? { required } : {}),
  };
}

export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema: toAnthropicInputSchema(input_schema),
  }));
}

export function isWriteTool(toolName: string): boolean {
  const def = allTools.find((t) => t.name === toolName);
  return def?.kind === "write";
}

export function toolRequiresConfirmation(toolName: string): boolean {
  const def = allTools.find((t) => t.name === toolName);
  return Boolean(def?.requiresConfirmation);
}
