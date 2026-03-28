import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  return { token, role, setAuth, clearAuth, isLoggedIn: Boolean(token) };
}
