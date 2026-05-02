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
  PairingStatus,
  SharingSettings,
  User,
} from "../types";

const ACCESS_TOKEN_KEY = "coupleloc.accessToken";

type RequestOptions = RequestInit & {
  auth?: boolean;
};

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
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
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

export function fetchSharingSettings() {
  return request<SharingSettings>("/locations/sharing");
}

export function updateSharingSettings(enabled: boolean) {
  return request<SharingSettings>("/locations/sharing", {
    method: "PATCH",
    body: JSON.stringify({ enabled })
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
