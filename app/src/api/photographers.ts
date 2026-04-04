import { apiRequest, API_BASE } from "./client";

export type Photographer = {
  key: string;
  name: string;
  email?: string;
  phone?: string;
  phone_mobile?: string;
  whatsapp?: string;
  initials?: string;
  is_admin?: boolean;
  active?: boolean;
  /** Im öffentlichen Buchungs-Wizard als Fotograf wählbar */
  bookable?: boolean;
  /** Relativer Pfad (z.B. assets/photographers/Name.png) oder volle URL */
  photo_url?: string;
  skills?: Record<string, number>;
};

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WorkHoursRow = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WorkHoursByDay = Record<WeekdayKey, WorkHoursRow>;

export type PhotographerSettings = {
  name?: string;
  email?: string;
  initials?: string;
  home_address?: string;
  home_lat?: number;
  home_lon?: number;
  radius_km?: number;
  max_radius_km?: number;
  event_color?: string;
  work_start?: string;
  work_end?: string;
  earliest_departure?: string;
  workdays?: string[];
  buffer_minutes?: number;
  slot_minutes?: number;
  phone?: string;
  native_language?: string;
  languages?: string[];
  is_admin?: boolean;
  active?: boolean;
  skills?: Record<string, number>;
  depart_times?: Record<string, string>;
  work_hours_by_day?: Partial<Record<WeekdayKey, Partial<WorkHoursRow>>>;
  phone_mobile?: string;
  whatsapp?: string;
  bookable?: boolean;
  photo_url?: string;
  blocked_dates?: Array<{ von?: string; bis?: string; grund?: string; ganztaegig?: boolean }>;
};

export type EmployeeLog = {
  id: number;
  employee_key: string;
  action: string;
  actor?: string;
  details?: Record<string, unknown> | null;
  created_at: string;
};

function normalizePhotographer(raw: unknown): Photographer {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    key: String(r.key || ""),
    name: String(r.name || ""),
    email: String(r.email || ""),
    phone: String(r.phone || ""),
    phone_mobile: String(r.phone_mobile || ""),
    whatsapp: String(r.whatsapp || ""),
    initials: String(r.initials || ""),
    is_admin: Boolean(r.is_admin),
    active: r.active == null ? true : Boolean(r.active),
    bookable: r.bookable == null ? true : Boolean(r.bookable),
    photo_url: String(r.photo_url || ""),
    skills: (r.skills && typeof r.skills === "object" ? (r.skills as Record<string, number>) : {}) || {},
  };
}

export type PortraitLibraryItem = { name: string; path: string };

export async function listPhotographerPortraitLibrary(token: string): Promise<PortraitLibraryItem[]> {
  const data = await apiRequest<{ ok?: boolean; files?: PortraitLibraryItem[] }>(
    "/api/admin/photographers/portraits/library",
    "GET",
    token,
  );
  return Array.isArray(data?.files) ? data.files : [];
}

export async function uploadPhotographerPortrait(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/admin/photographers/portraits/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* raw text */
    }
    throw new Error(msg.trim() || `HTTP ${res.status}`);
  }
  const json = JSON.parse(text) as { path?: string };
  if (!json.path) throw new Error("Ungültige Server-Antwort");
  return json.path;
}

export async function getPhotographers(token: string): Promise<Photographer[]> {
  const data = await apiRequest<unknown>("/api/admin/photographers", "GET", token);
  if (Array.isArray(data)) return data.map(normalizePhotographer);
  if (data && typeof data === "object" && Array.isArray((data as { photographers?: unknown[] }).photographers)) {
    return (data as { photographers: unknown[] }).photographers.map(normalizePhotographer);
  }
  return [];
}

export const createPhotographer = (token: string, payload: Record<string, unknown>) =>
  apiRequest("/api/admin/photographers", "POST", token, payload);

export async function getPhotographerSettings(token: string, key: string): Promise<PhotographerSettings> {
  const data = await apiRequest<unknown>(`/api/admin/photographers/${encodeURIComponent(key)}/settings`, "GET", token);
  if (data && typeof data === "object" && "settings" in data) {
    return (data as { settings: PhotographerSettings }).settings || {};
  }
  return (data as PhotographerSettings) || {};
}

export const updatePhotographerSettings = (token: string, key: string, payload: Record<string, unknown>) =>
  apiRequest(`/api/admin/photographers/${encodeURIComponent(key)}/settings`, "PUT", token, payload);

export const setPhotographerPassword = (token: string, key: string, newPassword: string) =>
  apiRequest(`/api/admin/photographers/${encodeURIComponent(key)}/set-password`, "POST", token, { newPassword });

export const sendPhotographerCredentials = (token: string, key: string) =>
  apiRequest(`/api/admin/photographers/${encodeURIComponent(key)}/send-credentials`, "POST", token);

export async function getEmployeeLog(token: string, key: string, limit = 80): Promise<EmployeeLog[]> {
  const data = await apiRequest<unknown>(`/api/admin/photographers/${encodeURIComponent(key)}/activity-log?limit=${limit}`, "GET", token);
  if (data && typeof data === "object" && Array.isArray((data as { logs?: unknown[] }).logs)) {
    return (data as { logs: EmployeeLog[] }).logs;
  }
  return [];
}

export async function addAbsenceEvent(
  token: string,
  key: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; eventId?: string }> {
  return apiRequest<{ ok: boolean; eventId?: string }>(
    `/api/admin/photographers/${encodeURIComponent(key)}/absence-calendar`,
    "POST",
    token,
    payload,
  );
}

export async function deactivatePhotographer(token: string, key: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/api/admin/photographers/${encodeURIComponent(key)}`,
    "DELETE",
    token,
  );
}

export async function reactivatePhotographer(token: string, key: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/api/admin/photographers/${encodeURIComponent(key)}/reactivate`,
    "PATCH",
    token,
  );
}

export async function deleteAbsenceEvent(
  token: string,
  key: string,
  eventId: string,
  email?: string,
): Promise<{ ok: boolean }> {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  return apiRequest<{ ok: boolean }>(
    `/api/admin/photographers/${encodeURIComponent(key)}/absence-calendar/${encodeURIComponent(eventId)}${query}`,
    "DELETE",
    token,
  );
}
