import { apiRequest } from "./client";

export type BugReport = {
  id: number;
  title: string;
  status: string;
  description?: string;
  created_at?: string;
};

export const getBugReports = (token: string) => apiRequest<BugReport[]>("/api/admin/bug-reports", "GET", token);
export const updateBugStatus = (token: string, id: number, status: string) =>
  apiRequest(`/api/admin/bug-reports/${id}/status`, "PATCH", token, { status });
export const deleteBugReport = (token: string, id: number) =>
  apiRequest(`/api/admin/bug-reports/${id}`, "DELETE", token);
export const sendBugMail = (token: string, id: number) =>
  apiRequest(`/api/admin/bug-reports/${id}/send-email`, "POST", token);
