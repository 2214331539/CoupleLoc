import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models import Couple, PairingInvite, User
from app.schemas import PairingAcceptRequest, PairingInviteOut, PairingStatusOut, PartnerPublic
from app.services.pairing import get_active_couple, get_partner_id

router = APIRouter(prefix="/pairing", tags=["pairing"])


def generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


@router.post("/invites", response_model=PairingInviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    if await get_active_couple(session, current_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already paired")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    for _ in range(5):
        code = generate_invite_code()
        existing = await session.execute(select(PairingInvite).where(PairingInvite.code == code))
        if existing.scalar_one_or_none() is None:
            invite = PairingInvite(
                code=code,
                creator_user_id=current_user.id,
                expires_at=expires_at,
            )
            session.add(invite)
            await session.commit()
            return PairingInviteOut(code=code, expires_at=expires_at)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not create invite",
    )


@router.post("/accept", response_model=PairingStatusOut)
async def accept_invite(
    payload: PairingAcceptRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    if await get_active_couple(session, current_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already paired")

    result = await session.execute(
        select(PairingInvite).where(PairingInvite.code == payload.code.strip().upper())
    )
    invite = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if invite is None or invite.consumed_at is not None or invite.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite is invalid or expired",
        )
    if invite.creator_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot accept your own invite",
        )
    if await get_active_couple(session, invite.creator_user_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invite creator is already paired",
        )

    user_a_id, user_b_id = sorted([invite.creator_user_id, current_user.id], key=str)
    couple = Couple(user_a_id=user_a_id, user_b_id=user_b_id, status="active")
    invite.consumed_at = now
    session.add(couple)
    await session.commit()

    partner = await session.get(User, invite.creator_user_id)
    return PairingStatusOut(
        paired=True,
        partner=PartnerPublic(
            id=partner.id,
            username=partner.username,
            display_name=partner.display_name,
        ),
    )


@router.get("/me", response_model=PairingStatusOut)
async def get_pairing_status(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    partner_id = await get_partner_id(session, current_user.id)
    if partner_id is None:
        return PairingStatusOut(paired=False)
    partner = await session.get(User, partner_id)
    return PairingStatusOut(
        paired=True,
        partner=PartnerPublic(
            id=partner.id,
            username=partner.username,
            display_name=partner.display_name,
        ),
    )
