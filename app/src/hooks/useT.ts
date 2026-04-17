import { useCallback } from "react";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";

export function useT() {
  const lang = useAuthStore((s) => s.language);
  return useCallback((key: string) => t(lang, key), [lang]);
}
