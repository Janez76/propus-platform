import type { ExpoConfig } from "expo/config";

/**
 * Single source of truth für API-Base: EXPO_PUBLIC_API_BASE_URL (EAS env / lokal via dotenv-cli)
 * fällt zurück auf app.json → extra.apiBaseUrl → ki.propus.ch.
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const extra = (config.extra || {}) as { apiBaseUrl?: string };
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    extra.apiBaseUrl ||
    "https://ki.propus.ch";

  return {
    ...config,
    extra: {
      ...config.extra,
      apiBaseUrl,
    },
  };
};
