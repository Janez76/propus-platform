export function ordersQueryKey(token: string) {
  return `orders:${token || "anon"}`;
}

export function customersQueryKey(token: string) {
  return `customers:${token || "anon"}`;
}

export function employeesQueryKey(token: string) {
  return `employees:${token || "anon"}`;
}

export function productsQueryKey(token: string) {
  return `products:${token || "anon"}`;
}

/** Tour-Manager Admin (Cookie-Session, nicht JWT) */
export function toursAdminDashboardQueryKey() {
  return "toursAdmin:dashboard";
}

export function toursAdminToursListQueryKey(paramsString: string) {
  return `toursAdmin:tours:${paramsString || "default"}`;
}

export function toursAdminTourDetailQueryKey(tourId: string) {
  return `toursAdmin:tour:${tourId}`;
}

export function toursAdminRenewalInvoicesQueryKey(status: string) {
  return `toursAdmin:renewalInvoices:${status || "all"}`;
}

export function adminInvoicesCentralQueryKey(type: string, status: string, search: string) {
  return `admin:invoicesCentral:${type}:${status || "all"}:${search || ""}`;
}

export function toursAdminBankImportQueryKey() {
  return "toursAdmin:bankImport";
}

export function toursAdminLinkMatterportQueryKey(params: string) {
  return `toursAdmin:linkMatterport:${params || "default"}`;
}

export function toursAdminLinkInvoiceQueryKey(tourId: string, search: string) {
  return `toursAdmin:linkInvoice:${tourId}:${search || ""}`;
}

export function toursAdminLinkExxasCustomerQueryKey(tourId: string) {
  return `toursAdmin:linkExxasCustomer:${tourId}`;
}

export function toursAdminCustomersListQueryKey(paramsString: string) {
  return `toursAdmin:customers:${paramsString || "default"}`;
}

export function toursAdminCustomerDetailQueryKey(customerId: string) {
  return `toursAdmin:customer:${customerId}`;
}

export function toursAdminPortalRolesQueryKey(tab: string) {
  return `toursAdmin:portalRoles:${tab || "intern"}`;
}

export function toursAdminTourSettingsQueryKey() {
  return "toursAdmin:tourSettings";
}

export function toursAdminEmailTemplatesQueryKey() {
  return "toursAdmin:emailTemplates";
}

export function toursAdminAutomationsQueryKey() {
  return "toursAdmin:automations";
}

export function toursAdminTeamQueryKey() {
  return "toursAdmin:team";
}

export function toursAdminAiChatConfigQueryKey() {
  return "toursAdmin:aiChatConfig";
}
