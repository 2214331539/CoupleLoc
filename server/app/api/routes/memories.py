from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models import Couple, MemoryPoint, User
from app.schemas import MemoryPointIn, MemoryPointOut
from app.services.connection_manager import connection_manager
from app.services.pairing import get_active_couple

router = APIRouter(prefix="/memories", tags=["memories"])


async def require_active_couple(session: AsyncSession, user_id) -> Couple:
    couple = await get_active_couple(session, user_id)
    if couple is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active partner")
    return couple


def get_partner_id(couple: Couple, user_id):
    return couple.user_b_id if couple.user_a_id == user_id else couple.user_a_id


def memory_point_to_event(action: str, point: MemoryPoint | None, point_id=None) -> dict:
    return {
        "type": "memory.point_changed",
        "action": action,
        "point_id": str(point_id or point.id),
        "point": MemoryPointOut.model_validate(point).model_dump(mode="json") if point else None,
    }


@router.get("/points", response_model=list[MemoryPointOut])
async def list_points(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    result = await session.execute(
        select(MemoryPoint)
        .where(MemoryPoint.couple_id == couple.id)
        .order_by(MemoryPoint.created_at.desc())
    )
    return result.scalars().all()


@router.post("/points", response_model=MemoryPointOut, status_code=status.HTTP_201_CREATED)
async def create_point(
    payload: MemoryPointIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    point = MemoryPoint(
        couple_id=couple.id,
        created_by_user_id=current_user.id,
        title=payload.title.strip(),
        note=payload.note.strip() if payload.note else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    session.add(point)
    await session.commit()
    await session.refresh(point)

    await connection_manager.send_to_user(
        get_partner_id(couple, current_user.id),
        memory_point_to_event("created", point),
    )
    return point


@router.delete("/points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_point(
    point_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    point = await session.get(MemoryPoint, point_id)
    if point is None or point.couple_id != couple.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory point not found")

    await session.delete(point)
    await session.commit()
    await connection_manager.send_to_user(
        get_partner_id(couple, current_user.id),
        memory_point_to_event("deleted", None, point_id),
    )
