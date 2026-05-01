/**
 * Hostname für die öffentliche KI-/Assistant-Domain (nur Assistant + Login + APIs).
 */
export const KI_ASSISTANT_HOST = "ki.propus.ch";

export function isKiAssistantHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  return hostname.split(":")[0].toLowerCase() === KI_ASSISTANT_HOST;
}
