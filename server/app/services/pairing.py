from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Couple


async def get_active_couple(session: AsyncSession, user_id: UUID) -> Couple | None:
    result = await session.execute(
        select(Couple).where(
            Couple.status == "active",
            or_(Couple.user_a_id == user_id, Couple.user_b_id == user_id),
        )
    )
    return result.scalar_one_or_none()


async def get_partner_id(session: AsyncSession, user_id: UUID) -> UUID | None:
    couple = await get_active_couple(session, user_id)
    if couple is None:
        return None
    return couple.user_b_id if couple.user_a_id == user_id else couple.user_a_id

