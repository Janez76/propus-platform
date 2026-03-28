import { Navigate } from "react-router-dom";

/** Alias `/admin/roles` → zentrale Rechte-Oberfläche unter Einstellungen. */
export function RolesPage() {
  return <Navigate to="/settings/access" replace />;
}
