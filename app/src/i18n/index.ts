import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";
import it from "./it.json";

const map = { de, en, fr, it };

export type Lang = keyof typeof map;

export function t(lang: Lang, key: string): string {
  const dict = map[lang] || map.de;
  const val = (dict as Record<string, unknown>)[key];
  return typeof val === "string" ? val : key;
}
