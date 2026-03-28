import { useEffect, useState } from "react";
import { getSystemSettings } from "../api/settings";
import { useAuthStore } from "../store/authStore";
import { useDbHintsStore } from "../store/dbHintsStore";

let cachedDbHintsEnabled: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

async function loadDbHintsEnabled(token?: string): Promise<boolean> {
  if (cachedDbHintsEnabled != null) return cachedDbHintsEnabled;
  if (inFlight) return inFlight;
  inFlight = getSystemSettings(token)
    .then((settings) => Boolean(settings["feature.dbFieldHints"]))
    .catch(() => false)
    .then((enabled) => {
      cachedDbHintsEnabled = enabled;
      inFlight = null;
      return enabled;
    });
  return inFlight;
}

export function useDbFieldHints(): boolean {
  const token = useAuthStore((s) => s.token);
  const override = useDbHintsStore((s) => s.override);
  const [backendEnabled, setBackendEnabled] = useState<boolean>(cachedDbHintsEnabled ?? false);

  useEffect(() => {
    loadDbHintsEnabled(token).then(setBackendEnabled).catch(() => setBackendEnabled(false));
  }, [token]);

  return override !== null ? override : backendEnabled;
}
