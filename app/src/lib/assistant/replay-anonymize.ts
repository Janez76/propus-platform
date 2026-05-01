/** Reine String-Maskierung für Replay-Export (Tests ohne DB). */

export function anonymizeReplayText(text: string): string {
  let s = text;
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]");
  s = s.replace(/\b0\d{2}\s*\d{3}\s*\d{2}\s*\d{2}\b/g, "[phone]");
  s = s.replace(/(?:\+41|0041)\s*[1-9](?:[\s\-/]\d){6,}\d/g, "[phone]");
  return s;
}
