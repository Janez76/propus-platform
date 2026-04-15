export interface CustomerProfile {
  email: string;
  name: string;
  company: string;
  phone: string;
  street: string;
  zipcity: string;
}

function getAdminToken(): string {
  try {
    return (
      window.localStorage.getItem("admin_token_v2") ||
      window.sessionStorage.getItem("admin_token_v2") ||
      ""
    );
  } catch {
    return "";
  }
}

export async function getCustomerProfile(): Promise<CustomerProfile | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/auth/profile", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean } & CustomerProfile;
    return data.ok ? data : null;
  } catch {
    return null;
  }
}
