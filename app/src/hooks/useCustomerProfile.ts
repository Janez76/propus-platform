import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { isKundenRole } from "../lib/permissions";
import { getCustomerProfile, type CustomerProfile } from "../api/customer";

export function useCustomerProfile() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !isKundenRole(role)) {
      setProfile(null);
      return;
    }
    setLoading(true);
    getCustomerProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [token, role]);

  return { profile, loading };
}
