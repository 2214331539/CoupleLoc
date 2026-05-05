from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.config import get_settings
from app.models import LatestLocation, SharingSettings, User
from app.schemas import (
    LocationIn,
    LocationOut,
    LocationStateOut,
    SharingSettingsIn,
    SharingSettingsOut,
)
from app.services.connection_manager import connection_manager
from app.services.pairing import get_partner_id

router = APIRouter(prefix="/locations", tags=["locations"])


def apply_expired_sharing(settings: SharingSettings) -> None:
    expires_at = settings.expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if (
        settings.enabled
        and settings.mode == "one_hour"
        and expires_at is not None
        and expires_at <= datetime.now(timezone.utc)
    ):
        settings.enabled = False
        settings.mode = "paused"
        settings.expires_at = None


def is_sharing_active(settings: SharingSettings) -> bool:
    apply_expired_sharing(settings)
    return settings.enabled and settings.mode != "paused"


async def get_or_create_sharing_settings(session: AsyncSession, user_id) -> SharingSettings:
    settings = await session.get(SharingSettings, user_id)
    if settings is None:
        settings = SharingSettings(user_id=user_id, enabled=True, mode="always")
        session.add(settings)
        await session.flush()
    apply_expired_sharing(settings)
    return settings


def location_to_out(
    location: LatestLocation,
    settings: SharingSettings | None = None,
    *,
    viewer_is_owner: bool = False,
) -> LocationOut:
    output = LocationOut.model_validate(location)
    if settings is None or viewer_is_owner:
        return output

    if not settings.share_battery:
        output.battery_level = None
        output.is_charging = None

    if not settings.precise_location:
        output.latitude = round(output.latitude, 3)
        output.longitude = round(output.longitude, 3)
        output.accuracy = max(output.accuracy or 0, 500)

    return output


def location_to_event(
    location: LatestLocation,
    settings: SharingSettings | None = None,
    *,
    viewer_is_owner: bool = False,
) -> dict:
    return {
        "type": "location.updated",
        "location": location_to_out(
            location,
            settings,
            viewer_is_owner=viewer_is_owner,
        ).model_dump(mode="json"),
    }


def sharing_to_event(user_id, settings: SharingSettings) -> dict:
    return {
        "type": "sharing.updated",
        "user_id": str(user_id),
        "settings": SharingSettingsOut.model_validate(settings).model_dump(mode="json"),
    }


def low_battery_to_event(location: LatestLocation, settings: SharingSettings) -> dict:
    return {
        "type": "battery.low",
        "location": location_to_out(location, settings).model_dump(mode="json"),
    }


@router.get("/state", response_model=LocationStateOut)
async def get_location_state(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    my_settings = await get_or_create_sharing_settings(session, current_user.id)
    my_latest = await session.get(LatestLocation, current_user.id)

    partner_settings = None
    partner_latest = None
    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is not None:
        partner_settings = await get_or_create_sharing_settings(session, partner_id)
        if is_sharing_active(partner_settings):
            partner_latest = await session.get(LatestLocation, partner_id)

    await session.commit()
    await session.refresh(my_settings)
    if partner_settings is not None:
        await session.refresh(partner_settings)

    return LocationStateOut(
        my_sharing=SharingSettingsOut.model_validate(my_settings),
        partner_sharing=(
            SharingSettingsOut.model_validate(partner_settings)
            if partner_settings is not None
            else None
        ),
        my_latest=(
            location_to_out(my_latest, my_settings, viewer_is_owner=True)
            if my_latest is not None
            else None
        ),
        partner_latest=(
            location_to_out(partner_latest, partner_settings)
            if partner_latest is not None and partner_settings is not None
            else None
        ),
    )


@router.get("/sharing", response_model=SharingSettingsOut)
async def get_sharing_settings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    settings = await get_or_create_sharing_settings(session, current_user.id)
    await session.commit()
    await session.refresh(settings)
    return settings


@router.patch("/sharing", response_model=SharingSettingsOut)
async def update_sharing_settings(
    payload: SharingSettingsIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    settings = await get_or_create_sharing_settings(session, current_user.id)

    if payload.mode is not None:
        settings.mode = payload.mode
        if payload.mode == "paused":
            settings.enabled = False
            settings.expires_at = None
        elif payload.mode == "one_hour":
            settings.enabled = True
            settings.expires_at = payload.expires_at or datetime.now(timezone.utc) + timedelta(hours=1)
        else:
            settings.enabled = True
            settings.expires_at = None

    if payload.enabled is not None:
        settings.enabled = payload.enabled
        if not payload.enabled:
            settings.mode = "paused"
            settings.expires_at = None
        elif settings.mode == "paused":
            settings.mode = "always"

    if payload.expires_at is not None:
        settings.expires_at = payload.expires_at
    if payload.share_battery is not None:
        settings.share_battery = payload.share_battery
    if payload.share_distance is not None:
        settings.share_distance = payload.share_distance
    if payload.precise_location is not None:
        settings.precise_location = payload.precise_location

    apply_expired_sharing(settings)
    await session.commit()
    await session.refresh(settings)

    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is not None:
        await connection_manager.send_to_user(
            partner_id,
            sharing_to_event(current_user.id, settings),
        )

    return settings


@router.post("/me", response_model=LocationOut)
async def update_my_location(
    payload: LocationIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    settings = await get_or_create_sharing_settings(session, current_user.id)
    if not is_sharing_active(settings):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location sharing is disabled",
        )
    if settings.mode == "foreground" and payload.source == "background":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Background sharing is disabled",
        )

    recorded_at = payload.recorded_at or datetime.now(timezone.utc)
    location = await session.get(LatestLocation, current_user.id)
    previous_battery_level = location.battery_level if location is not None else None
    if location is None:
        location = LatestLocation(user_id=current_user.id, recorded_at=recorded_at)
        session.add(location)

    location.latitude = payload.latitude
    location.longitude = payload.longitude
    location.accuracy = payload.accuracy
    location.speed = payload.speed
    location.heading = payload.heading
    location.battery_level = payload.battery_level
    location.is_charging = payload.is_charging
    location.source = payload.source
    location.recorded_at = recorded_at
    location.received_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(location)

    await connection_manager.send_to_user(
        current_user.id,
        location_to_event(location, settings, viewer_is_owner=True),
    )

    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is not None:
        await connection_manager.send_to_user(partner_id, location_to_event(location, settings))
        threshold = get_settings().low_battery_threshold
        if (
            settings.share_battery
            and location.battery_level is not None
            and location.battery_level <= threshold
            and (previous_battery_level is None or previous_battery_level > threshold)
        ):
            await connection_manager.send_to_user(partner_id, low_battery_to_event(location, settings))

    return location


@router.get("/me/latest", response_model=LocationOut)
async def get_my_latest_location(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    location = await session.get(LatestLocation, current_user.id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No location yet")
    return location


@router.get("/partner/latest", response_model=LocationOut)
async def get_partner_latest_location(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active partner")

    partner_settings = await get_or_create_sharing_settings(session, partner_id)
    if not is_sharing_active(partner_settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Partner sharing is disabled",
        )

    location = await session.get(LatestLocation, partner_id)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Partner has no location yet",
        )
    return location_to_out(location, partner_settings)
