export function extractSwissZip(address: string): string {
  const m = address.match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}
