/**
 * Home-Assistant-Tools — REST API gegen smartzh.janez.ch.
 * Token: HA_LONG_LIVED_TOKEN in den ENV-Vars.
 */

import type { ToolDefinition, ToolHandler } from './index';

const HA_BASE = process.env.HA_BASE_URL ?? 'https://smartzh.janez.ch';

async function ha(path: string, init?: RequestInit) {
  const token = process.env.HA_LONG_LIVED_TOKEN;
  if (!token) throw new Error('HA_LONG_LIVED_TOKEN fehlt');
  const res = await fetch(`${HA_BASE}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HA ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export const homeAssistantTools: ToolDefinition[] = [
  {
    name: 'ha_get_state',
    description: 'State einer Entität abfragen. Beispiel: light.wohnzimmer, sensor.temperatur_buero.',
    input_schema: {
      type: 'object',
      properties: { entity_id: { type: 'string' } },
      required: ['entity_id'],
    },
  },
  {
    name: 'ha_call_service',
    description:
      'Ruft einen Home-Assistant-Service auf. SCHREIBENDE AKTION. Beispiel: domain=light, service=turn_on, entity_id=light.wohnzimmer.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'z.B. light, switch, climate, scene' },
        service: { type: 'string', description: 'z.B. turn_on, turn_off, set_temperature' },
        entity_id: { type: 'string' },
        data: { type: 'object', description: 'Zusätzliche Service-Daten' },
      },
      required: ['domain', 'service', 'entity_id'],
    },
  },
];

export const homeAssistantHandlers: Record<string, ToolHandler> = {
  ha_get_state: async (input) => {
    const data = await ha(`/states/${input.entity_id}`);
    return data;
  },

  ha_call_service: async (input) => {
    const body = { entity_id: input.entity_id, ...((input.data as object) ?? {}) };
    await ha(`/services/${input.domain}/${input.service}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ok: true, called: `${input.domain}.${input.service}`, target: input.entity_id };
  },
};
