import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { apiRequest } from "../api/client";

export type CustomerProfile = {
  name: string;
  email: string;
  company: string;
  phone: string;
  street: string;
  zipcity: string;
};

// Modul-weiter Cache: verhindert wiederholte Requests, wenn mehrere
// Komponenten gleichzeitig gemountet sind (z.B. Header + StepBilling).
const profileCache = new Map<string, CustomerProfile>();

export function useCustomerProfile(): { profile: CustomerProfile | null; loading: boolean } {
  const token = useAuthStore((s) => s.token);
  const [profile, setProfile] = useState<CustomerProfile | null>(() => {
    if (!token) return null;
    return profileCache.get(token) ?? null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }
    // Cache-Hit: kein erneuter Request.
    const cached = profileCache.get(token);
    if (cached) {
      setProfile(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiRequest<CustomerProfile>("/api/auth/profile", "GET")
      .then((p) => {
        if (cancelled) return;
        profileCache.set(token, p);
        setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { profile, loading };
}
