import { Navigate } from "react-router-dom";

/**
 * /admin/tours  →  weiterleiten zur React-Admin-Dashboard-Seite des Tour Managers.
 * Die EJS-Oberfläche ist weiterhin unter /tour-manager/admin erreichbar (Fallback).
 */
export function ToursAdminHomePage() {
  return <Navigate to="/admin/tours/dashboard" replace />;
}

