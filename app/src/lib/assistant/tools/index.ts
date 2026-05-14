import { customersHandlers, customersTools } from "./customers";
import { databaseHandlers, databaseTools } from "./database";
import { designsHandlers, designsTools } from "./designs";
import { emailHandlers, emailTools } from "./email";
import { invoicesHandlers, invoicesTools } from "./invoices";
import { mapsHandlers, mapsTools } from "./maps";
import { matterportHandlers, matterportTools } from "./matterport";
import { memoriesHandlers, memoriesTools } from "./memories";
import { ordersHandlers, ordersTools } from "./orders";
import { posteingangHandlers, posteingangTools } from "./posteingang";
import { teamsHandlers, teamsTools } from "./teams";
import { toursHandlers, toursTools } from "./tours";
import { weatherHandlers, weatherTools } from "./weather";
import { writeTools, writeHandlers } from "./writes";
import { reportingHandlers, reportingTools } from "./reporting";
import type { ToolDefinition, ToolHandler } from "./types";
export type { AssistantLiveLocation } from "../live-location-types";
export { LIVE_ORIGIN_PLACEHOLDER, parseClientLiveLocation } from "../live-location-types";
export type { ToolContext, ToolDefinition, ToolHandler } from "./types";

export const allTools: ToolDefinition[] = [
  ...memoriesTools,
  ...reportingTools,
  ...ordersTools,
  ...toursTools,
  ...invoicesTools,
  ...posteingangTools,
  ...customersTools,
  ...emailTools,
  ...designsTools,
  ...databaseTools,
  ...weatherTools,
  ...mapsTools,
  ...matterportTools,
  ...teamsTools,
  ...writeTools,
];

export const allHandlers: Record<string, ToolHandler> = {
  ...memoriesHandlers,
  ...reportingHandlers,
  ...ordersHandlers,
  ...toursHandlers,
  ...invoicesHandlers,
  ...posteingangHandlers,
  ...customersHandlers,
  ...emailHandlers,
  ...designsHandlers,
  ...databaseHandlers,
  ...weatherHandlers,
  ...mapsHandlers,
  ...matterportHandlers,
  ...teamsHandlers,
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
