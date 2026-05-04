export type User = {
  id: string;
  username: string;
  phone_number: string | null;
  display_name: string;
};

export type Partner = User;

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: User;
};

export type PairingStatus = {
  paired: boolean;
  partner: Partner | null;
};

export type PairingInvite = {
  code: string;
  expires_at: string;
};

export type SharingSettings = {
  enabled: boolean;
  mode: "always" | "one_hour" | "foreground" | "paused";
  expires_at: string | null;
  share_battery: boolean;
  share_distance: boolean;
  precise_location: boolean;
  updated_at: string;
};

export type LocationPayload = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery_level: number | null;
  is_charging: boolean | null;
  source: "foreground" | "background";
  recorded_at: string;
};

export type LocationSnapshot = LocationPayload & {
  user_id: string;
  received_at: string;
};

export type LocationState = {
  my_sharing: SharingSettings;
  partner_sharing: SharingSettings | null;
  my_latest: LocationSnapshot | null;
  partner_latest: LocationSnapshot | null;
};

export type ChatMessage = {
  id: string;
  couple_id: string;
  sender_user_id: string;
  message_type: "text" | "quick_status";
  body: string;
  status_key: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  couple_id: string;
  created_by_user_id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryPoint = {
  id: string;
  couple_id: string;
  created_by_user_id: string;
  title: string;
  note: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
};

export type LocationEvent = {
  type: "location.updated";
  location: LocationSnapshot;
};

export type SharingEvent = {
  type: "sharing.updated";
  user_id: string;
  settings: SharingSettings;
};

export type ChatMessageEvent = {
  type: "chat.message_created";
  message: ChatMessage;
};

export type CalendarEventChangedEvent = {
  type: "calendar.event_changed";
  action: "created" | "updated" | "deleted";
  event_id: string;
  event: CalendarEvent | null;
};

export type MemoryPointChangedEvent = {
  type: "memory.point_changed";
  action: "created" | "deleted";
  point_id: string;
  point: MemoryPoint | null;
};

export type BatteryLowEvent = {
  type: "battery.low";
  location: LocationSnapshot;
};

export type RealtimeEvent =
  | LocationEvent
  | SharingEvent
  | ChatMessageEvent
  | CalendarEventChangedEvent
  | MemoryPointChangedEvent
  | BatteryLowEvent;
