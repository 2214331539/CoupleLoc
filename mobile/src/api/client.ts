import * as SecureStore from "expo-secure-store";

import { env } from "../config/env";
import type {
  AuthResponse,
  CalendarEvent,
  ChatMessage,
  LocationPayload,
  LocationSnapshot,
  LocationState,
  MemoryPoint,
  PairingInvite,
  PairingRequest,
  PairingStatus,
  SharingSettings,
  User,
} from "../types";

const ACCESS_TOKEN_KEY = "coupleloc.accessToken";

type RequestOptions = RequestInit & {
  auth?: boolean;
};

type ApiErrorBody = {
  detail?: string | Array<{ loc?: Array<string | number>; msg?: string; type?: string }>;
};

function formatApiError(body: ApiErrorBody) {
  if (typeof body.detail === "string") {
    return body.detail;
  }

  if (Array.isArray(body.detail)) {
    return body.detail
      .map((item) => {
        const field = item.loc?.filter((part) => part !== "body").join(".");
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function saveAccessToken(token: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.auth !== false) {
    const token = await getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      const apiMessage = formatApiError(body);
      if (apiMessage) {
        message = apiMessage;
      }
    } catch {
      // Keep the HTTP status as the fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function register(username: string, password: string, displayName: string) {
  const auth = await request<AuthResponse>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ username, password, display_name: displayName })
  });
  await saveAccessToken(auth.access_token);
  return auth;
}

export async function login(username: string, password: string) {
  const auth = await request<AuthResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ username, password })
  });
  await saveAccessToken(auth.access_token);
  return auth;
}

export type SmsPurpose = "login" | "register" | "reset_password";

export type SmsCodeResponse = {
  phone_number: string;
  purpose: SmsPurpose;
  expires_at: string;
  resend_after_seconds: number;
  debug_code: string | null;
};

export function sendSmsCode(phoneNumber: string, purpose: SmsPurpose) {
  return request<SmsCodeResponse>("/auth/sms/send", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phone_number: phoneNumber, purpose })
  });
}

export async function loginWithSms(phoneNumber: string, code: string) {
  const auth = await request<AuthResponse>("/auth/sms/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ phone_number: phoneNumber, code })
  });
  await saveAccessToken(auth.access_token);
  return auth;
}

export async function registerWithSms(
  phoneNumber: string,
  code: string,
  displayName: string,
  password: string
) {
  const auth = await request<AuthResponse>("/auth/sms/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phone_number: phoneNumber,
      code,
      display_name: displayName,
      password
    })
  });
  await saveAccessToken(auth.access_token);
  return auth;
}

export async function resetPasswordWithSms(
  phoneNumber: string,
  code: string,
  newPassword: string
) {
  const auth = await request<AuthResponse>("/auth/password/reset", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      phone_number: phoneNumber,
      code,
      new_password: newPassword
    })
  });
  await saveAccessToken(auth.access_token);
  return auth;
}

export function fetchMe() {
  return request<User>("/auth/me");
}

export function fetchPairingStatus() {
  return request<PairingStatus>("/pairing/me");
}

export function createPairingInvite() {
  return request<PairingInvite>("/pairing/invites", {
    method: "POST"
  });
}

export function acceptPairingInvite(code: string) {
  return request<PairingStatus>("/pairing/accept", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function submitPairingRequest(code: string) {
  return request<PairingRequest>("/pairing/requests", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function listIncomingPairingRequests() {
  return request<PairingRequest[]>("/pairing/requests/incoming");
}

export function listOutgoingPairingRequests() {
  return request<PairingRequest[]>("/pairing/requests/outgoing");
}

export function approvePairingRequest(requestId: string) {
  return request<PairingStatus>(`/pairing/requests/${requestId}/approve`, {
    method: "POST"
  });
}

export function rejectPairingRequest(requestId: string) {
  return request<PairingRequest>(`/pairing/requests/${requestId}/reject`, {
    method: "POST"
  });
}

export function fetchSharingSettings() {
  return request<SharingSettings>("/locations/sharing");
}

export type SharingSettingsUpdate = Partial<{
  enabled: boolean;
  mode: SharingSettings["mode"];
  expires_at: string | null;
  share_battery: boolean;
  share_distance: boolean;
  precise_location: boolean;
}>;

export function updateSharingSettings(payload: boolean | SharingSettingsUpdate) {
  const body =
    typeof payload === "boolean"
      ? { enabled: payload, mode: payload ? "always" : "paused" }
      : payload;

  return request<SharingSettings>("/locations/sharing", {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export function fetchLocationState() {
  return request<LocationState>("/locations/state");
}

export function postLocation(payload: LocationPayload) {
  return request<LocationSnapshot>("/locations/me", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchMyLatestLocation() {
  return request<LocationSnapshot>("/locations/me/latest");
}

export function fetchPartnerLatestLocation() {
  return request<LocationSnapshot>("/locations/partner/latest");
}

export function buildLocationWebSocketUrl(token: string) {
  return `${env.wsBaseUrl}/ws/locations?token=${encodeURIComponent(token)}`;
}

export function listChatMessages() {
  return request<ChatMessage[]>("/chat/messages");
}

export function sendChatMessage(payload: {
  message_type: "text" | "quick_status";
  body: string;
  status_key?: string | null;
}) {
  return request<ChatMessage>("/chat/messages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listCalendarEvents() {
  return request<CalendarEvent[]>("/calendar/events");
}

export function createCalendarEvent(payload: {
  title: string;
  notes?: string | null;
  starts_at: string;
  ends_at?: string | null;
}) {
  return request<CalendarEvent>("/calendar/events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateCalendarEvent(
  eventId: string,
  payload: Partial<{
    title: string;
    notes: string | null;
    starts_at: string;
    ends_at: string | null;
  }>
) {
  return request<CalendarEvent>(`/calendar/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteCalendarEvent(eventId: string) {
  return request<void>(`/calendar/events/${eventId}`, {
    method: "DELETE"
  });
}

export function listMemoryPoints() {
  return request<MemoryPoint[]>("/memories/points");
}

export function createMemoryPoint(payload: {
  title: string;
  note?: string | null;
  latitude: number;
  longitude: number;
}) {
  return request<MemoryPoint>("/memories/points", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteMemoryPoint(pointId: string) {
  return request<void>(`/memories/points/${pointId}`, {
    method: "DELETE"
  });
}
