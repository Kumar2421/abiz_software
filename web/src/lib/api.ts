import type {
  Contact,
  Conversation,
  DashboardStats,
  Message,
} from "@/lib/types";

/**
 * Empty means "same origin" — on Netlify the API is a function mounted at
 * /api, so relative URLs hit it directly. Local development sets
 * NEXT_PUBLIC_API_URL=http://localhost:4000 in web/.env.local.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
    /** Per-field validation messages, when the API rejected the body. */
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
  }

  /** First message for a given field, for inline form errors. */
  forField(name: string): string | undefined {
    return this.issues.find((issue) => issue.path === name)?.message;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    // The session lives in an httpOnly cookie set by the API.
    credentials: "include",
    headers: {
      // FormData sets its own multipart Content-Type, boundary included.
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload.message as string) ?? "Request failed",
      (payload.error as string) ?? "error",
      Array.isArray(payload.details) ? (payload.details as FieldIssue[]) : [],
    );
  }

  return payload as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export interface SessionUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: "owner" | "admin";
}

export interface ConnectionState {
  status: "connected" | "pending" | "disconnected";
  verifiedName: string | null;
  qualityRating: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  displayNumber: string;
}

export interface SettingsPayload {
  company: { name: string; address: string };
  whatsapp: {
    displayNumber: string;
    phoneNumberId: string;
    accessTokenHint: string | null;
    verifyToken: string;
    status: "connected" | "pending" | "disconnected";
    /** Populated only by a successful check against Meta. */
    verifiedName: string | null;
    qualityRating: string | null;
    lastError: string | null;
    lastCheckedAt: string | null;
  };
  welcome: { enabled: boolean; body: string };
  profile: { name: string; email: string };
  /** "mock" keeps messages inside Abiz; "cloud" delivers via Meta. */
  driver: "mock" | "cloud";
}

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAYMENT_PENDING"
  | "PAST_DUE"
  | "EXPIRED"
  | "CANCELLED"
  | "SUSPENDED";

export interface Subscription {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  plan: {
    code: string;
    name: string;
    amountPaise: number;
    currency: string;
  } | null;
}

export interface BillingStatus {
  subscription: Subscription;
  plan: {
    code: string;
    name: string;
    amountPaise: number;
    currency: string;
    periodDays: number | null;
  };
  /** False until Razorpay keys are set on the server. */
  configured: boolean;
  /** False for platform admins — they operate Abiz, they do not buy it. */
  billable: boolean;
  /** 0 means pay upfront — there is no free trial to mention. */
  trialDays: number;

  /** Whether checkout may be started right now, and why not if closed. */
  paymentWindow: {
    open: boolean;
    reason?: string;
    opensAt?: string | null;
  };
}

export interface PaymentRecord {
  orderId: string;
  paymentId: string | null;
  amountPaise: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  method: string | null;
  error: string | null;
  createdAt: string;
}

/** TRIAL and ACTIVE may send; everything else is read-only. */
export const canSend = (status: SubscriptionStatus) =>
  status === "TRIAL" || status === "ACTIVE";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin";
  status: "active" | "suspended";
  created_at: string;
  company_name: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  activated_at: string | null;
  plan_name: string | null;
  paid_paise: string | number;
}

export interface AdminPayment {
  id: string;
  company_name: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: string;
  error: string | null;
  created_at: string;
}

export interface AdminAccount {
  company_id: string;
  company_name: string;
  display_number: string | null;
  phone_number_id: string | null;
  status: "connected" | "pending" | "disconnected";
  updated_at: string;
}

export interface AdminWebhookLog {
  id: string;
  company_id: string | null;
  event_type: string;
  payload: unknown;
  error: string | null;
  created_at: string;
}

export const api = {
  register: (body: {
    name: string;
    email: string;
    password: string;
    companyName?: string;
  }) => post<{ user: SessionUser }>("/api/auth/register", body),

  login: (body: { email: string; password: string }) =>
    post<{ user: SessionUser }>("/api/auth/login", body),

  logout: () => post<{ ok: true }>("/api/auth/logout"),

  me: () =>
    request<{ user: SessionUser; company: { name: string; address: string } }>(
      "/api/auth/me",
    ),

  forgotPassword: (email: string) =>
    post<{
      ok: true;
      message?: string;
      /** Present only when PASSWORD_RESET_MODE=direct and the account exists. */
      resetToken?: string;
      /** false when no account uses that address (direct mode only). */
      exists?: boolean;
      devResetUrl?: string;
    }>("/api/auth/forgot-password", { email }),

  resetPassword: (body: { token: string; newPassword: string }) =>
    post<{ ok: true }>("/api/auth/reset-password", body),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    post<{ ok: true }>("/api/auth/change-password", body),

  conversations: (params: { folder?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.folder) query.set("folder", params.folder);
    if (params.search) query.set("search", params.search);
    const suffix = query.toString() ? `?${query}` : "";
    return request<{ conversations: Conversation[] }>(
      `/api/conversations${suffix}`,
    );
  },

  startConversation: (body: { phone: string; name?: string }) =>
    post<{ conversation: Conversation }>("/api/conversations", body),

  thread: (id: string) =>
    request<{
      conversation: Conversation;
      messages: Message[];
      sendWindow: { open: boolean; msLeft: number };
    }>(`/api/conversations/${id}/messages`),

  sendMessage: (id: string, body: string) =>
    post<{ message: Message }>(`/api/conversations/${id}/messages`, { body }),

  sendAttachment: (id: string, file: File | Blob, caption?: string) => {
    const form = new FormData();
    // Blobs from MediaRecorder have no name; give voice notes a real one.
    form.append(
      "file",
      file,
      file instanceof File ? file.name : "voice-note.webm",
    );
    if (caption) form.append("caption", caption);
    // No Content-Type header: the browser must set the multipart boundary.
    return request<{ message: Message }>(`/api/conversations/${id}/media`, {
      method: "POST",
      body: form,
    });
  },

  markRead: (id: string) =>
    post<{ conversation: Conversation }>(`/api/conversations/${id}/read`),

  archive: (id: string, archived: boolean) =>
    post<{ conversation: Conversation }>(`/api/conversations/${id}/archive`, {
      archived,
    }),

  contacts: (search?: string) =>
    request<{ contacts: Contact[] }>(
      `/api/contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),

  createContact: (body: { name: string; phone: string; notes?: string }) =>
    post<{ contact: Contact; conversationId: string }>("/api/contacts", body),

  updateContact: (id: string, body: Partial<Contact>) =>
    request<{ contact: Contact }>(`/api/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteContact: (id: string) =>
    request<{ ok: true }>(`/api/contacts/${id}`, { method: "DELETE" }),

  settings: () => request<SettingsPayload>("/api/settings"),

  saveCompany: (body: { name: string; address?: string }) =>
    put<{ ok: true }>("/api/settings/company", body),

  saveWhatsApp: (body: {
    displayNumber?: string;
    phoneNumberId?: string;
    accessToken?: string;
    verifyToken?: string;
  }) =>
    put<{ ok: true; connection: ConnectionState }>(
      "/api/settings/whatsapp",
      body,
    ),

  testWhatsApp: () =>
    post<{ connection: ConnectionState }>("/api/settings/whatsapp/test"),

  /** Starts Embedded Signup: mints a CSRF state bound to the logged-in company. */
  metaAuthStart: () => post<{ state: string }>("/api/auth/meta/start"),

  /** Completes Embedded Signup once the Facebook SDK hands back a code + WABA/phone ids. */
  metaAuthCallback: (body: {
    code: string;
    state: string;
    wabaId: string;
    phoneNumberId: string;
    businessId?: string;
  }) =>
    post<{ ok: true; connection: ConnectionState; webhookWarning: string | null }>(
      "/api/auth/meta/callback",
      body,
    ),

  saveWelcome: (body: { enabled: boolean; body: string }) =>
    put<{ ok: true }>("/api/settings/welcome", body),

  saveProfile: (body: { name: string }) =>
    put<{ ok: true }>("/api/settings/profile", body),

  stats: () =>
    request<{
      stats: DashboardStats;
      whatsapp: {
        displayNumber: string;
        phoneNumberId: string;
        status: "connected" | "pending" | "disconnected";
      };
      driver: "mock" | "cloud";
    }>("/api/settings/stats"),

  billingStatus: () => request<BillingStatus>("/api/billing/status"),

  createOrder: () =>
    post<{
      orderId: string;
      amountPaise: number;
      currency: string;
      keyId: string;
      planName: string;
    }>("/api/billing/order"),

  verifyPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => post<{ subscription: Subscription }>("/api/billing/verify", body),

  payments: () => request<{ payments: PaymentRecord[] }>("/api/billing/payments"),

  adminUsers: () => request<{ users: AdminUser[] }>("/api/admin/users"),

  adminSetUserStatus: (id: string, status: "active" | "suspended") =>
    post<{ ok: true }>(`/api/admin/users/${id}/status`, { status }),

  adminDeleteUser: (id: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  adminPayments: () =>
    request<{ payments: AdminPayment[] }>("/api/admin/payments"),

  adminAccounts: () =>
    request<{ accounts: AdminAccount[] }>("/api/admin/whatsapp-accounts"),

  adminWebhookLogs: () =>
    request<{ logs: AdminWebhookLog[] }>("/api/admin/webhook-logs"),

  /** Dev-only: plays the customer's side so inbound flows can be exercised. */
  simulateInbound: (body: { phone: string; body: string; name?: string }) =>
    post<{ message: Message }>("/api/dev/inbound", body),
};
