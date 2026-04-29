import { apiRequest, API_BASE } from "./client";

type OrderObject = {
  type?: string;
  area?: number | string;
  floors?: number | string;
  rooms?: number | string;
  desc?: string;
};

type OrderServicePackage = { key?: string; label?: string; price?: number };
type OrderServiceAddon = { id?: string; label?: string; price?: number };

type OrderBilling = {
  salutation?: string;
  first_name?: string;
  company?: string;
  company_email?: string;
  company_phone?: string;
  name?: string;
  email?: string;
  phone?: string;
  phone_mobile?: string;
  onsiteName?: string;
  onsitePhone?: string;
  street?: string;
  zip?: string;
  city?: string;
  zipcity?: string;
  order_ref?: string;
  notes?: string;
  alt_company?: string;
  alt_company_email?: string;
  alt_company_phone?: string;
  alt_street?: string;
  alt_zip?: string;
  alt_city?: string;
  alt_zipcity?: string;
  alt_salutation?: string;
  alt_first_name?: string;
  alt_name?: string;
  alt_email?: string;
  alt_phone?: string;
  alt_phone_mobile?: string;
};

type OrderPricing = { subtotal?: number; discount?: number; vat?: number; total?: number };
type OrderSchedule = { date?: string; time?: string; durationMin?: number };
type OrderPhotographer = { key?: string; name?: string; email?: string; phone?: string };

export type Order = {
  orderNo: string;
  status: string;
  doneAt?: string | null;
  closedAt?: string | null;

  // Provisorische Buchung (Phase 1)
  provisionalBookedAt?: string | null;
  provisionalExpiresAt?: string | null;
  provisionalReminder1SentAt?: string | null;
  provisionalReminder2SentAt?: string | null;

  // Bestätigungs-Workflow
  confirmationToken?: string | null;
  confirmationTokenExpiresAt?: string | null;
  confirmationPendingSince?: string | null;
  attendeeEmails?: string | null;
  onsiteEmail?: string | null;

  // Kalender-Sync
  calendarSyncStatus?: "none" | "tentative" | "final" | "deleted" | "error";

  // Review / Feedback
  reviewRequestSentAt?: string | null;
  reviewRequestCount?: number;

  // Gründe
  cancelReason?: string | null;
  pauseReason?: string | null;

  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerStreet?: string;
  customerZipcity?: string;
  customerContactName?: string;
  customerContactEmail?: string;
  customerContactPhone?: string;
  listingSlug?: string;
  listingTitle?: string;
  listingStatus?: string;
  appointmentDate?: string;
  total?: number;
  address?: string;
  object?: OrderObject;
  services?: { package?: OrderServicePackage; addons?: OrderServiceAddon[] };
  billing?: OrderBilling;
  pricing?: OrderPricing;
  schedule?: OrderSchedule;
  photographer?: OrderPhotographer;
  notes?: string;
  internalNotes?: string;
  onsiteContacts?: Array<{ name?: string; phone?: string; email?: string; calendarInvite?: boolean }>;
  keyPickup?: { address?: string; notes?: string } | null;
  lastRescheduleOldDate?: string | null;
  lastRescheduleOldTime?: string | null;

  /** Exxas-Export (Dienstleistungsauftrag) */
  exxasOrderId?: string | null;
  exxasOrderNumber?: string | null;
  exxasStatus?: string;
  exxasError?: string | null;
};

export type OrderMessage = { id: number; message: string; created_at: string };
export type OrderChatMessage = {
  id: number;
  orderNo: number;
  senderRole: "customer" | "photographer" | string;
  senderId: string;
  senderName: string;
  message: string;
  readAt: string | null;
  createdAt: string | null;
};

export type OrderChatAvailability = {
  readable: boolean;
  writable: boolean;
  feedbackUntil: string | null;
};
export type OrderUploadCategory =
  | "raw_bilder"
  | "raw_grundrisse"
  | "raw_video"
  | "raw_sonstiges"
  | "final_websize"
  | "final_fullsize"
  | "final_grundrisse"
  | "final_video"
  | "zur_auswahl";
export type OrderUploadMode = "existing" | "new_batch";

export type OrderUploadFileStatus =
  | "staged"
  | "stored"
  | "skipped_duplicate"
  | "skipped_invalid_type"
  | "failed";

export type OrderUploadResultFile = {
  id?: number;
  originalName: string;
  fileName?: string;
  storedName?: string;
  stagingPath?: string;
  status: OrderUploadFileStatus;
  bytes?: number;
  sizeBytes?: number;
  sha256?: string;
  duplicateReason?: string;
  duplicateOf?: string;
  reason?: string;
  errorMessage?: string;
};

type OrderUploadTreeFileNode = {
  type: "file";
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
};

type OrderUploadTreeDirNode = {
  type: "dir";
  name: string;
  relativePath: string;
  children: OrderUploadTreeNode[];
};

export type OrderUploadTreeNode = OrderUploadTreeFileNode | OrderUploadTreeDirNode;

export type OrderUploadsResponse = {
  ok: boolean;
  orderNo: number;
  folderType?: "raw_material" | "customer_folder";
  folderName: string;
  rootPath: string;
  exists?: boolean;
  tree: OrderUploadTreeNode[];
};

export type OrderStorageFolderSummary = {
  folderType: "raw_material" | "customer_folder";
  status: "pending" | "ready" | "linked" | "archived" | "failed";
  orderNo: number;
  displayName: string;
  companyName?: string;
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  archivedAt?: string | null;
  lastError?: string | null;
  nextcloudShareUrl?: string | null;
};

export type OrderStorageHealthRoot = {
  key: string;
  path: string;
  ok: boolean;
  mounted: boolean | null;
  error?: string;
};

export type OrderUploadBatch = {
  id: string;
  orderNo: number;
  folderType: "raw_material" | "customer_folder";
  category: OrderUploadCategory;
  uploadMode: OrderUploadMode;
  uploadGroupId: string | null;
  uploadGroupTotalParts: number;
  uploadGroupPartIndex: number;
  status: "staged" | "transferring" | "completed" | "failed" | "retrying" | "cancelled";
  localPath: string;
  targetRelativePath: string | null;
  targetAbsolutePath: string | null;
  batchFolder: string | null;
  comment: string;
  fileCount: number;
  totalBytes: number;
  uploadedBy: string;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  files: OrderUploadResultFile[];
};

export type OrderUploadResponse = {
  ok: boolean;
  batch: OrderUploadBatch;
};

export type OrderStorageSummaryResponse = {
  ok: boolean;
  orderNo: number;
  orderAddress: string;
  roots: OrderStorageHealthRoot[];
  folders: OrderStorageFolderSummary[];
  batches: OrderUploadBatch[];
};

export type OrderFolderType = "raw_material" | "customer_folder";

export type UploadConflictMode = "skip" | "replace";

export type UploadOrderFilesInput = {
  category: OrderUploadCategory;
  uploadMode: OrderUploadMode;
  folderType?: OrderFolderType;
  batchFolderName?: string;
  comment?: string;
  files: File[];
  conflictMode?: UploadConflictMode;
  customFolderName?: string;
  uploadGroupId?: string;
  uploadGroupTotalParts?: number;
  uploadGroupPartIndex?: number;
  addOrderSuffix?: boolean;
};

export type ChunkedUploadInitInput = {
  sessionId?: string;
  filename: string;
  size: number;
  type?: string;
  lastModified?: number;
};

export type ChunkedUploadInitResponse = {
  ok: boolean;
  uploadId: string;
  sessionId: string;
};

export type ChunkedUploadStatusResponse = {
  ok: boolean;
  uploadId: string;
  sessionId: string;
  completed: Record<number, boolean>;
};

export type ChunkedUploadCompleteResponse = {
  ok: boolean;
  uploadId: string;
  sessionId: string;
};

export type FinalizeChunkedUploadInput = {
  sessionId: string;
  category: OrderUploadCategory;
  uploadMode: OrderUploadMode;
  folderType?: OrderFolderType;
  batchFolderName?: string;
  comment?: string;
  conflictMode?: UploadConflictMode;
  customFolderName?: string;
  uploadGroupId?: string;
  uploadGroupTotalParts?: number;
  uploadGroupPartIndex?: number;
  addOrderSuffix?: boolean;
};

function buildUploadPathQuery(path: string) {
  return `path=${encodeURIComponent(path)}`;
}

function toIsoFromSchedule(schedule?: OrderSchedule): string | undefined {
  if (!schedule?.date || !schedule?.time) return undefined;
  const value = `${schedule.date}T${schedule.time}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

function normalizeOrder(raw: unknown): Order {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const billing = (r.billing && typeof r.billing === "object" ? r.billing : {}) as OrderBilling;
  const schedule = (r.schedule && typeof r.schedule === "object" ? r.schedule : {}) as OrderSchedule;
  const pricing = (r.pricing && typeof r.pricing === "object" ? r.pricing : {}) as OrderPricing;
  const objectData = (r.object && typeof r.object === "object" ? r.object : {}) as OrderObject;
  const services = (r.services && typeof r.services === "object" ? r.services : {}) as {
    package?: OrderServicePackage;
    addons?: OrderServiceAddon[];
  };
  const photographer = (r.photographer && typeof r.photographer === "object" ? r.photographer : {}) as OrderPhotographer;
  const orderNoRaw = r.orderNo ?? r.order_no ?? "";
  const addressRaw = r.address ?? billing.street ?? "";

  return {
    orderNo: String(orderNoRaw || ""),
    status: String(r.status || "pending"),
    doneAt: (r.doneAt as string | null | undefined) ?? (r.done_at as string | null | undefined) ?? null,
    customerName: String((r.customerName as string) || billing.name || ""),
    customerEmail: String((r.customerEmail as string) || billing.email || ""),
    customerPhone: String((r.customerPhone as string) || ""),
    customerStreet: String((r.customerStreet as string) || ""),
    customerZipcity: String((r.customerZipcity as string) || ""),
    customerContactName: String((r.customerContactName as string) || ""),
    customerContactEmail: String((r.customerContactEmail as string) || ""),
    customerContactPhone: String((r.customerContactPhone as string) || ""),
    listingSlug: String((r.listingSlug as string) || (r.listing_slug as string) || ""),
    listingTitle: String((r.listingTitle as string) || (r.listing_title as string) || ""),
    listingStatus: String((r.listingStatus as string) || (r.listing_status as string) || ""),
    appointmentDate: String((r.appointmentDate as string) || toIsoFromSchedule(schedule) || ""),
    total: Number(r.total ?? pricing.total ?? 0),
    address: String(addressRaw || ""),
    object: objectData,
    services: {
      package: services.package || {},
      addons: Array.isArray(services.addons) ? services.addons : [],
    },
    billing,
    pricing,
    schedule,
    photographer,
    notes: String((r.notes as string) || billing.notes || ""),
    internalNotes: String((r.internalNotes as string) || (r.internal_notes as string) || ""),
    onsiteContacts: Array.isArray(r.onsiteContacts)
      ? (r.onsiteContacts as Array<{ name?: string; phone?: string; email?: string; calendarInvite?: boolean }>)
      : Array.isArray(r.onsite_contacts)
        ? (r.onsite_contacts as Array<{ name?: string; phone?: string; email?: string; calendarInvite?: boolean }>)
        : [],
    keyPickup: (r.keyPickup as { address?: string; notes?: string } | null) || null,
    lastRescheduleOldDate: (r.lastRescheduleOldDate as string | null | undefined) ?? (r.last_reschedule_old_date as string | null | undefined) ?? null,
    lastRescheduleOldTime: (r.lastRescheduleOldTime as string | null | undefined) ?? (r.last_reschedule_old_time as string | null | undefined) ?? null,
    exxasOrderId: (r.exxasOrderId as string | null | undefined) ?? (r.exxas_order_id as string | null | undefined) ?? null,
    exxasOrderNumber: (r.exxasOrderNumber as string | null | undefined) ?? (r.exxas_order_number as string | null | undefined) ?? null,
    exxasStatus: String((r.exxasStatus as string) || (r.exxas_status as string) || "not_sent"),
    exxasError: (r.exxasError as string | null | undefined) ?? (r.exxas_error as string | null | undefined) ?? null,
  };
}

export async function getOrders(token: string): Promise<Order[]> {
  const data = await apiRequest<unknown>("/api/admin/orders", "GET", token);
  if (Array.isArray(data)) return data.map(normalizeOrder);
  if (data && typeof data === "object" && Array.isArray((data as { orders?: unknown[] }).orders)) {
    return (data as { orders: unknown[] }).orders.map(normalizeOrder);
  }
  return [];
}

export async function getOrder(token: string, orderNo: string): Promise<Order> {
  const data = await apiRequest<unknown>(`/api/admin/orders/${encodeURIComponent(orderNo)}`, "GET", token);
  if (data && typeof data === "object" && "order" in data) {
    return normalizeOrder((data as { order: unknown }).order);
  }
  return normalizeOrder(data);
}

export type CreateExxasServiceOrderResult = {
  ok: boolean;
  exxasOrderId?: string;
  exxasOrderNumber?: string | null;
  error?: string;
};

export async function createExxasServiceOrder(
  token: string,
  orderNo: string,
): Promise<CreateExxasServiceOrderResult> {
  return apiRequest<CreateExxasServiceOrderResult>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/exxas-create-service-order`,
    "POST",
    token,
  );
}

export type SyncExxasOrderLinksResult = {
  ok: boolean;
  exxasOrderId?: string;
  exxasLinkTour?: string | null;
  exxasLinkDrive?: string | null;
  error?: string;
};

export async function syncExxasOrderLinks(
  token: string,
  orderNo: string,
): Promise<SyncExxasOrderLinksResult> {
  return apiRequest<SyncExxasOrderLinksResult>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/exxas-sync-links`,
    "POST",
    token,
  );
}

export const updateOrderStatus = (
  token: string,
  orderNo: string,
  status: string,
  options?: {
    sendEmails?: boolean;
    sendEmailTargets?: { customer?: boolean; office?: boolean; photographer?: boolean; cc?: boolean };
    reason?: string;
    forceSlot?: boolean;
    overrideReason?: string;
  },
) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}/status`, "PATCH", token, {
    status,
    sendEmails: options?.sendEmails ?? false,
    ...(options?.sendEmailTargets !== undefined ? { sendEmailTargets: options.sendEmailTargets } : {}),
    ...(options?.reason !== undefined ? { reason: options.reason } : {}),
    ...(options?.forceSlot !== undefined ? { forceSlot: options.forceSlot } : {}),
    ...(options?.overrideReason !== undefined ? { overrideReason: options.overrideReason } : {}),
  });

export type EditAddon = { id: string; label: string; price: number; qty?: number; group?: string };
export type EditServices = { package?: { key: string; label: string; price: number } | null; addons?: EditAddon[] };
export type EditPricing = { subtotal: number; discount: number; vat: number; total: number };

export type OnsiteContactPayload = {
  name?: string;
  phone?: string;
  email?: string;
  calendarInvite?: boolean;
};

export const updateOrderDetails = (
  token: string,
  orderNo: string,
  payload: {
    billing?: Partial<OrderBilling>;
    object?: Partial<OrderObject>;
    address?: string;
    services?: EditServices;
    pricing?: EditPricing;
    keyPickup?: { address: string; notes?: string } | null;
    onsiteContacts?: OnsiteContactPayload[];
    onsite_email?: string | null;
    internalNotes?: string;
  },
) => apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}`, "PATCH", token, payload);

export const rescheduleOrder = (
  token: string,
  orderNo: string,
  date: string,
  time: string,
  durationMin?: number,
) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}/reschedule`, "PATCH", token, {
    date,
    time,
    ...(durationMin !== undefined ? { durationMin } : {}),
  });

export const assignPhotographer = (token: string, orderNo: string, photographerKey: string) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}/photographer`, "PATCH", token, { photographerKey });

export const createOrder = (token: string, payload: Record<string, unknown>) =>
  apiRequest<Order>("/api/admin/orders", "POST", token, payload);

export const deleteOrder = (token: string, orderNo: string) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}`, "DELETE", token);

export const confirmOrder = (token: string, orderNo: string, forceSlot?: boolean) =>
  apiRequest<{ ok: boolean; confirmed?: boolean; already?: boolean; status: string; orderNo: number }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/confirm`,
    "POST",
    token,
    forceSlot ? { forceSlot: true } : {},
  );

export const getOrderMessages = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; messages: OrderMessage[] }>(`/api/admin/orders/${encodeURIComponent(orderNo)}/messages`, "GET", token)
    .then(r => r.messages ?? []);

export const postOrderMessage = (token: string, orderNo: string, message: string) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}/message`, "POST", token, { message });

export const getChatMessages = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; messages: OrderChatMessage[]; availability: OrderChatAvailability }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/chat`,
    "GET",
    token,
  );

export const postChatMessage = (token: string, orderNo: string, message: string) =>
  apiRequest<{ ok: boolean; message: OrderChatMessage; availability: OrderChatAvailability }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/chat/message`,
    "POST",
    token,
    { message },
  );

export const markChatRead = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; changed: number }>(`/api/admin/orders/${encodeURIComponent(orderNo)}/chat/read`, "PATCH", token);

export const resendCustomerEmail = (token: string, orderNo: string) =>
  apiRequest(`/api/admin/orders/${encodeURIComponent(orderNo)}/resend-customer-email`, "POST", token);

export type ResendEmailType = "confirmation_request" | "reschedule" | "booking_confirmed";

export const resendEmail = (
  token: string,
  orderNo: string,
  emailType: ResendEmailType,
) =>
  apiRequest<{ ok: boolean; sent?: boolean; to?: string }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/resend-email`,
    "POST",
    token,
    { emailType },
  );

export const resendStatusEmails = (
  token: string,
  orderNo: string,
  sendEmailTargets: { customer?: boolean; office?: boolean; photographer?: boolean; cc?: boolean },
) =>
  apiRequest<{ ok: boolean; sent: number }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/resend-status-emails`,
    "POST",
    token,
    { sendEmailTargets },
  );

export async function uploadOrderFiles(
  token: string,
  orderNo: string,
  input: UploadOrderFilesInput,
  onProgress?: (percent: number) => void,
): Promise<OrderUploadResponse> {
  const {
    category,
    uploadMode,
    folderType,
    batchFolderName,
    comment,
    files,
    conflictMode,
    customFolderName,
    uploadGroupId,
    uploadGroupTotalParts,
    uploadGroupPartIndex,
    addOrderSuffix,
  } = input;
  const formData = new FormData();
  formData.append("category", category);
  formData.append("uploadMode", uploadMode);
  if (folderType) formData.append("folderType", folderType);
  if (batchFolderName?.trim()) formData.append("batchFolderName", batchFolderName.trim());
  if (comment?.trim()) formData.append("comment", comment.trim());
  if (conflictMode) formData.append("conflictMode", conflictMode);
  if (customFolderName?.trim()) formData.append("customFolderName", customFolderName.trim());
  if (uploadGroupId?.trim()) formData.append("uploadGroupId", uploadGroupId.trim());
  if (addOrderSuffix) formData.append("addOrderSuffix", "true");
  if (Number.isFinite(uploadGroupTotalParts) && Number(uploadGroupTotalParts) > 0) {
    formData.append("uploadGroupTotalParts", String(uploadGroupTotalParts));
  }
  if (Number.isFinite(uploadGroupPartIndex) && Number(uploadGroupPartIndex) > 0) {
    formData.append("uploadGroupPartIndex", String(uploadGroupPartIndex));
  }
  for (const file of files) formData.append("files", file);

  return await new Promise<OrderUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = CHUNKED_UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new Error("Ungültige Serverantwort"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as OrderUploadResponse);
        return;
      }
      const errMsg =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: unknown }).error || "")
          : "";
      reject(new Error(errMsg || `HTTP ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.ontimeout = () => reject(new Error("Upload Timeout"));
    xhr.send(formData);
  });
}

const CHUNKED_UPLOAD_TIMEOUT_MS = 900_000;

export const initChunkedUpload = (
  token: string,
  orderNo: string,
  input: ChunkedUploadInitInput,
) =>
  apiRequest<ChunkedUploadInitResponse>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-chunked/init`,
    "POST",
    token,
    input,
    { timeoutMs: CHUNKED_UPLOAD_TIMEOUT_MS, maxRetries: 3 },
  );

export const getChunkedUploadStatus = (
  token: string,
  orderNo: string,
  uploadId: string,
) =>
  apiRequest<ChunkedUploadStatusResponse>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-chunked/status`,
    "POST",
    token,
    { uploadId },
    { timeoutMs: CHUNKED_UPLOAD_TIMEOUT_MS, maxRetries: 3 },
  );

export function uploadChunkPart(
  token: string,
  orderNo: string,
  input: { uploadId: string; index: number; chunk: Blob; filename: string },
  onProgress?: (loaded: number, total: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append("uploadId", input.uploadId);
    formData.append("index", String(input.index));
    formData.append("chunk", input.chunk, input.filename);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/upload-chunked/part`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = CHUNKED_UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      onProgress(Number(event.loaded || 0), Number(event.total || 0));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `HTTP ${xhr.status}`;
      try {
        const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          message = String((parsed as { error?: unknown }).error || message);
        }
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => {
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;
      reject(new Error(online ? "Verbindung zum Server unterbrochen (Chunk-Upload)" : "Kein Internet – Chunk-Upload pausiert"));
    };
    xhr.ontimeout = () => reject(new Error("Chunk-Upload Timeout (Verbindung zu langsam oder Server nicht erreichbar)"));
    xhr.send(formData);
  });
}

export const completeChunkedUpload = (
  token: string,
  orderNo: string,
  uploadId: string,
) =>
  apiRequest<ChunkedUploadCompleteResponse>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-chunked/complete`,
    "POST",
    token,
    { uploadId },
    { timeoutMs: CHUNKED_UPLOAD_TIMEOUT_MS, maxRetries: 3 },
  );

export const finalizeChunkedUpload = (
  token: string,
  orderNo: string,
  input: FinalizeChunkedUploadInput,
) =>
  apiRequest<OrderUploadResponse>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-chunked/finalize`,
    "POST",
    token,
    input,
    { timeoutMs: CHUNKED_UPLOAD_TIMEOUT_MS, maxRetries: 3 },
  );

export const getOrderUploads = (token: string, orderNo: string, folderType?: string) => {
  const qs = folderType ? `?folderType=${encodeURIComponent(folderType)}` : "";
  return apiRequest<OrderUploadsResponse>(`/api/admin/orders/${encodeURIComponent(orderNo)}/uploads${qs}`, "GET", token);
};

export const getOrderStorageSummary = (token: string, orderNo: string) =>
  apiRequest<OrderStorageSummaryResponse>(`/api/admin/orders/${encodeURIComponent(orderNo)}/storage`, "GET", token);

export const provisionOrderStorage = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; folders: OrderStorageFolderSummary[] }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/storage/provision`,
    "POST",
    token,
  );

export const linkOrderStorageFolder = (
  token: string,
  orderNo: string,
  input: { folderType: "raw_material" | "customer_folder"; relativePath: string; rename?: boolean },
) =>
  apiRequest<{ ok: boolean; folders: OrderStorageFolderSummary[]; renameWarning: string | null }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/storage/link`,
    "POST",
    token,
    input,
  );

export const archiveOrderStorageFolder = (
  token: string,
  orderNo: string,
  folderType: "raw_material" | "customer_folder",
) =>
  apiRequest<{ ok: boolean; folders: OrderStorageFolderSummary[] }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/storage/folder?folderType=${encodeURIComponent(folderType)}`,
    "DELETE",
    token,
  );

export const generateNextcloudShare = (
  token: string,
  orderNo: string,
  folderType: "customer_folder" = "customer_folder",
) =>
  apiRequest<{ ok: boolean; shareUrl: string; folders: OrderStorageFolderSummary[] }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/storage/nextcloud-share`,
    "POST",
    token,
    { folderType },
  );

export interface StorageBrowseEntry {
  name: string;
  relativePath: string;
}

export interface StorageBrowseResult {
  ok: boolean;
  rootKind: string;
  currentRelativePath: string;
  parentRelativePath: string | null;
  entries: StorageBrowseEntry[];
}

export const browseAdminStorage = (
  token: string,
  rootKind: "customer" | "raw",
  relativePath: string,
) =>
  apiRequest<StorageBrowseResult>(
    `/api/admin/storage/browse?rootKind=${encodeURIComponent(rootKind)}&relativePath=${encodeURIComponent(relativePath)}`,
    "GET",
    token,
  );

export const getUploadBatch = (token: string, orderNo: string, batchId: string) =>
  apiRequest<{ ok: boolean; batch: OrderUploadBatch }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-batches/${encodeURIComponent(batchId)}`,
    "GET",
    token,
    undefined,
    { timeoutMs: 15_000, maxRetries: 1, dedupe: false },
  );

export const listUploadBatches = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; batches: OrderUploadBatch[] }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-batches`,
    "GET",
    token,
  );

export const retryUploadBatch = (token: string, orderNo: string, batchId: string) =>
  apiRequest<{ ok: boolean; batch: OrderUploadBatch }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-batches/${encodeURIComponent(batchId)}/retry`,
    "POST",
    token,
  );

export const confirmUploadBatch = (token: string, orderNo: string, batchId: string, finalComment?: string) =>
  apiRequest<{ ok: boolean }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/upload-batches/${encodeURIComponent(batchId)}/confirm`,
    "POST",
    token,
    finalComment ? { finalComment } : {},
    { timeoutMs: 120_000 },
  );

export const generateWebsizeRebuild = (token: string, orderNo: string) =>
  apiRequest<{ ok: boolean; stats: Record<string, number>; forced: boolean }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/uploads/websize-rebuild`,
    "POST",
    token,
  );

export const deleteOrderUploadFile = (token: string, orderNo: string, relativePath: string, folderType?: string) => {
  const ft = folderType ? `&folderType=${encodeURIComponent(folderType)}` : "";
  return apiRequest<{ ok: boolean; deleted: string }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/uploads/file?${buildUploadPathQuery(relativePath)}${ft}`,
    "DELETE",
    token,
  );
};

export const clearOrderUploadFolder = (token: string, orderNo: string, relativePath: string, folderType?: string) => {
  const ft = folderType ? `&folderType=${encodeURIComponent(folderType)}` : "";
  return apiRequest<{ ok: boolean; deleted: number }>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/uploads/folder?${buildUploadPathQuery(relativePath)}${ft}`,
    "DELETE",
    token,
  );
};

export function getOrderUploadFileUrl(token: string, orderNo: string, relativePath: string, folderType?: string): string {
  const ft = folderType ? `&folderType=${encodeURIComponent(folderType)}` : "";
  const q = `${buildUploadPathQuery(relativePath)}&token=${encodeURIComponent(token)}${ft}`;
  return `${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/uploads/file?${q}`;
}

export function uploadOrderFile(token: string, orderNo: string, file: File) {
  return uploadOrderFiles(token, orderNo, {
    category: "raw_sonstiges",
    uploadMode: "existing",
    files: [file],
  });
}

export function getOrderIcsUrl(token: string, orderNo: string): string {
  return `${API_BASE}/api/admin/orders/${encodeURIComponent(orderNo)}/ics?token=${encodeURIComponent(token)}`;
}

export type OrderEmailLogEntry = {
  id: number;
  template_key: string;
  recipient: string;
  sent_at: string;
  template_language: string | null;
};

export type OrderEmailLogResponse = {
  ok: boolean;
  entries: OrderEmailLogEntry[];
  availability?: "available" | "no_db";
};

export const getOrderEmailLog = (token: string, orderNo: string) =>
  apiRequest<OrderEmailLogResponse>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/email-log`,
    "GET",
    token,
  ).then((r) => ({
    ok: !!r?.ok,
    entries: r?.entries ?? [],
    availability: r?.availability ?? "available",
  }));

export type OrderEventLogEntry = {
  id: number;
  orderNo: number;
  eventType: string;
  actorUser: string;
  actorRole: string;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: string;
};

export const getOrderEvents = (token: string, orderNo: string, opts?: { limit?: number; before?: number }) => {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.before) params.set("before", String(opts.before));
  const qs = params.toString();
  return apiRequest<OrderEventLogEntry[]>(
    `/api/admin/orders/${encodeURIComponent(orderNo)}/events${qs ? `?${qs}` : ""}`,
    "GET",
    token,
  );
};
