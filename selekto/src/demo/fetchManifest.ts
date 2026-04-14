import type { NasManifestJson } from "./demoTypes";

const SUFFIXES = ["gallery.json", "images.json", "manifest.json", "propus-gallery.json"];

export async function fetchManifestFromUrl(url: string): Promise<NasManifestJson | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const tryOne = async (u: string): Promise<NasManifestJson | null> => {
    try {
      const res = await fetch(u, { mode: "cors", credentials: "omit" });
      if (!res.ok) return null;
      const text = await res.text();
      try {
        return JSON.parse(text) as NasManifestJson;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  };

  let data = await tryOne(trimmed);
  if (data) return data;

  const base = trimmed.replace(/\/?$/, "/");
  for (const name of SUFFIXES) {
    data = await tryOne(base + name);
    if (data) return data;
  }

  return null;
}
