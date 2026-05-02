from datetime import datetime, timezone

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


async def get_or_create_sharing_settings(session: AsyncSession, user_id) -> SharingSettings:
    settings = await session.get(SharingSettings, user_id)
    if settings is None:
        settings = SharingSettings(user_id=user_id, enabled=True)
        session.add(settings)
        await session.flush()
    return settings


def location_to_event(location: LatestLocation) -> dict:
    return {
        "type": "location.updated",
        "location": LocationOut.model_validate(location).model_dump(mode="json"),
    }


def sharing_to_event(user_id, settings: SharingSettings) -> dict:
    return {
        "type": "sharing.updated",
        "user_id": str(user_id),
        "settings": SharingSettingsOut.model_validate(settings).model_dump(mode="json"),
    }


def low_battery_to_event(location: LatestLocation) -> dict:
    return {
        "type": "battery.low",
        "location": LocationOut.model_validate(location).model_dump(mode="json"),
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
        if partner_settings.enabled:
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
        my_latest=LocationOut.model_validate(my_latest) if my_latest is not None else None,
        partner_latest=(
            LocationOut.model_validate(partner_latest) if partner_latest is not None else None
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
    settings.enabled = payload.enabled
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
    if not settings.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location sharing is disabled",
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

    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is not None:
        await connection_manager.send_to_user(partner_id, location_to_event(location))
        threshold = get_settings().low_battery_threshold
        if (
            location.battery_level is not None
            and location.battery_level <= threshold
            and (previous_battery_level is None or previous_battery_level > threshold)
        ):
            await connection_manager.send_to_user(partner_id, low_battery_to_event(location))

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
    if not partner_settings.enabled:
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
    return location
