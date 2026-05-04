from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserPublic(BaseModel):
    id: UUID
    username: str
    phone_number: str | None = None
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class AuthRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(AuthRequest):
    display_name: str = Field(min_length=1, max_length=64)


class SmsCodeSendRequest(BaseModel):
    phone_number: str = Field(min_length=5, max_length=32)
    purpose: Literal["login", "register", "reset_password"]


class SmsCodeSendResponse(BaseModel):
    phone_number: str
    purpose: str
    expires_at: datetime
    resend_after_seconds: int
    debug_code: str | None = None


class SmsLoginRequest(BaseModel):
    phone_number: str = Field(min_length=5, max_length=32)
    code: str = Field(min_length=4, max_length=8)


class SmsRegisterRequest(SmsLoginRequest):
    display_name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(SmsLoginRequest):
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class PairingInviteOut(BaseModel):
    code: str
    expires_at: datetime


class PairingAcceptRequest(BaseModel):
    code: str = Field(min_length=4, max_length=16)


class PartnerPublic(BaseModel):
    id: UUID
    username: str
    display_name: str


class PairingStatusOut(BaseModel):
    paired: bool
    partner: PartnerPublic | None = None


class SharingSettingsIn(BaseModel):
    enabled: bool | None = None
    mode: Literal["always", "one_hour", "foreground", "paused"] | None = None
    expires_at: datetime | None = None
    share_battery: bool | None = None
    share_distance: bool | None = None
    precise_location: bool | None = None


class SharingSettingsOut(BaseModel):
    enabled: bool
    mode: str
    expires_at: datetime | None
    share_battery: bool
    share_distance: bool
    precise_location: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LocationIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    speed: float | None = None
    heading: float | None = None
    battery_level: float | None = Field(default=None, ge=0, le=1)
    is_charging: bool | None = None
    source: str = Field(pattern="^(foreground|background)$")
    recorded_at: datetime | None = None


class LocationOut(BaseModel):
    user_id: UUID
    latitude: float
    longitude: float
    accuracy: float | None
    speed: float | None
    heading: float | None
    battery_level: float | None
    is_charging: bool | None
    source: str
    recorded_at: datetime
    received_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LocationStateOut(BaseModel):
    my_sharing: SharingSettingsOut
    partner_sharing: SharingSettingsOut | None = None
    my_latest: LocationOut | None = None
    partner_latest: LocationOut | None = None


class ChatMessageIn(BaseModel):
    message_type: str = Field(pattern="^(text|quick_status)$")
    body: str = Field(min_length=1, max_length=500)
    status_key: str | None = Field(default=None, max_length=64)


class ChatMessageOut(BaseModel):
    id: UUID
    couple_id: UUID
    sender_user_id: UUID
    message_type: str
    body: str
    status_key: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CalendarEventIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    starts_at: datetime
    ends_at: datetime | None = None


class CalendarEventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class CalendarEventOut(BaseModel):
    id: UUID
    couple_id: UUID
    created_by_user_id: UUID
    title: str
    notes: str | None
    starts_at: datetime
    ends_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemoryPointIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=1000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class MemoryPointOut(BaseModel):
    id: UUID
    couple_id: UUID
    created_by_user_id: UUID
    title: str
    note: str | None
    latitude: float
    longitude: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
