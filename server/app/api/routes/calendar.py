from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models import CalendarEvent, Couple, User
from app.schemas import CalendarEventIn, CalendarEventOut, CalendarEventPatch
from app.services.connection_manager import connection_manager
from app.services.pairing import get_active_couple

router = APIRouter(prefix="/calendar", tags=["calendar"])


async def require_active_couple(session: AsyncSession, user_id) -> Couple:
    couple = await get_active_couple(session, user_id)
    if couple is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active partner")
    return couple


def get_partner_id(couple: Couple, user_id):
    return couple.user_b_id if couple.user_a_id == user_id else couple.user_a_id


def validate_event_range(starts_at, ends_at) -> None:
    if ends_at is not None and ends_at < starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at must be after starts_at",
        )


def calendar_event_to_event(action: str, event: CalendarEvent | None, event_id=None) -> dict:
    return {
        "type": "calendar.event_changed",
        "action": action,
        "event_id": str(event_id or event.id),
        "event": CalendarEventOut.model_validate(event).model_dump(mode="json") if event else None,
    }


@router.get("/events", response_model=list[CalendarEventOut])
async def list_events(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    result = await session.execute(
        select(CalendarEvent)
        .where(CalendarEvent.couple_id == couple.id)
        .order_by(CalendarEvent.starts_at.asc(), CalendarEvent.created_at.asc())
    )
    return result.scalars().all()


@router.post("/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CalendarEventIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    validate_event_range(payload.starts_at, payload.ends_at)
    couple = await require_active_couple(session, current_user.id)
    event = CalendarEvent(
        couple_id=couple.id,
        created_by_user_id=current_user.id,
        title=payload.title.strip(),
        notes=payload.notes.strip() if payload.notes else None,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)

    await connection_manager.send_to_user(
        get_partner_id(couple, current_user.id),
        calendar_event_to_event("created", event),
    )
    return event


@router.patch("/events/{event_id}", response_model=CalendarEventOut)
async def update_event(
    event_id: UUID,
    payload: CalendarEventPatch,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    event = await session.get(CalendarEvent, event_id)
    if event is None or event.couple_id != couple.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar event not found",
        )

    if "title" in payload.model_fields_set and payload.title is not None:
        event.title = payload.title.strip()
    if "notes" in payload.model_fields_set:
        event.notes = payload.notes.strip() if payload.notes else None
    if "starts_at" in payload.model_fields_set and payload.starts_at is not None:
        event.starts_at = payload.starts_at
    if "ends_at" in payload.model_fields_set:
        event.ends_at = payload.ends_at

    validate_event_range(event.starts_at, event.ends_at)
    await session.commit()
    await session.refresh(event)

    await connection_manager.send_to_user(
        get_partner_id(couple, current_user.id),
        calendar_event_to_event("updated", event),
    )
    return event


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    event = await session.get(CalendarEvent, event_id)
    if event is None or event.couple_id != couple.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar event not found",
        )

    await session.delete(event)
    await session.commit()
    await connection_manager.send_to_user(
        get_partner_id(couple, current_user.id),
        calendar_event_to_event("deleted", None, event_id),
    )
