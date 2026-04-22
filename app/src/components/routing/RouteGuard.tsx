"use client";

import { Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";

type Props = {
  path: string;
  children: ReactElement;
  fallbackTo?: string;
};

/**
 * Route-Sichtbarkeit an effectiveCanAccessPath (Backend permissions + Legacy-Fallback).
 */
export function RouteGuard({ path, children, fallbackTo }: Props) {
  const { canAccessPath } = usePermissions();
  const { role } = useAuth();
  if (canAccessPath(path)) {
    return children;
  }
  const fallback =
    fallbackTo ?? (String(role) === "photographer" && path === "/dashboard" ? "/orders" : "/dashboard");
  return <Navigate to={fallback} replace />;
}
