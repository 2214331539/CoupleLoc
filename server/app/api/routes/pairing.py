import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models import Couple, PairingInvite, PairingRequest, User
from app.schemas import (
    PairingAcceptRequest,
    PairingInviteOut,
    PairingRequestOut,
    PairingStatusOut,
    PartnerPublic,
)
from app.services.connection_manager import connection_manager
from app.services.pairing import get_active_couple, get_partner_id

router = APIRouter(prefix="/pairing", tags=["pairing"])


def generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


def user_to_partner(user: User) -> PartnerPublic:
    return PartnerPublic(
        id=user.id,
        username=user.username,
        phone_number=user.phone_number,
        display_name=user.display_name,
    )


async def request_to_out(session: AsyncSession, request: PairingRequest) -> PairingRequestOut:
    invite = await session.get(PairingInvite, request.invite_id)
    requester = await session.get(User, request.requester_user_id)
    creator = await session.get(User, request.creator_user_id)
    return PairingRequestOut(
        id=request.id,
        invite_code=invite.code,
        status=request.status,
        requester=user_to_partner(requester),
        creator=user_to_partner(creator),
        created_at=request.created_at,
        responded_at=request.responded_at,
    )


def pairing_event(event_type: str, request: PairingRequestOut, pairing: PairingStatusOut | None = None) -> dict:
    return {
        "type": event_type,
        "request": request.model_dump(mode="json"),
        "pairing": pairing.model_dump(mode="json") if pairing else None,
    }


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


@router.post("/requests", response_model=PairingRequestOut, status_code=status.HTTP_201_CREATED)
async def create_pairing_request(
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

    existing_result = await session.execute(
        select(PairingRequest).where(
            PairingRequest.invite_id == invite.id,
            PairingRequest.requester_user_id == current_user.id,
            PairingRequest.status == "pending",
        )
    )
    existing_request = existing_result.scalar_one_or_none()
    if existing_request is not None:
        return await request_to_out(session, existing_request)

    pairing_request = PairingRequest(
        invite_id=invite.id,
        creator_user_id=invite.creator_user_id,
        requester_user_id=current_user.id,
        status="pending",
    )
    session.add(pairing_request)
    await session.commit()
    await session.refresh(pairing_request)

    request_out = await request_to_out(session, pairing_request)
    await connection_manager.send_to_user(
        invite.creator_user_id,
        pairing_event("pairing.request_created", request_out),
    )
    return request_out


@router.get("/requests/incoming", response_model=list[PairingRequestOut])
async def list_incoming_requests(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(PairingRequest)
        .where(
            PairingRequest.creator_user_id == current_user.id,
            PairingRequest.status == "pending",
        )
        .order_by(PairingRequest.created_at.desc())
    )
    return [await request_to_out(session, item) for item in result.scalars().all()]


@router.get("/requests/outgoing", response_model=list[PairingRequestOut])
async def list_outgoing_requests(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(PairingRequest)
        .where(
            PairingRequest.requester_user_id == current_user.id,
            PairingRequest.status == "pending",
        )
        .order_by(PairingRequest.created_at.desc())
    )
    return [await request_to_out(session, item) for item in result.scalars().all()]


@router.post("/requests/{request_id}/approve", response_model=PairingStatusOut)
async def approve_pairing_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    if await get_active_couple(session, current_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already paired")

    pairing_request = await session.get(PairingRequest, request_id)
    if (
        pairing_request is None
        or pairing_request.creator_user_id != current_user.id
        or pairing_request.status != "pending"
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pairing request not found")

    if await get_active_couple(session, pairing_request.requester_user_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Requester is already paired")

    invite = await session.get(PairingInvite, pairing_request.invite_id)
    now = datetime.now(timezone.utc)
    if invite is None or invite.consumed_at is not None or invite.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite is invalid or expired")

    user_a_id, user_b_id = sorted([pairing_request.creator_user_id, pairing_request.requester_user_id], key=str)
    couple = Couple(user_a_id=user_a_id, user_b_id=user_b_id, status="active")
    invite.consumed_at = now
    pairing_request.status = "approved"
    pairing_request.responded_at = now
    session.add(couple)

    other_pending_result = await session.execute(
        select(PairingRequest).where(
            PairingRequest.creator_user_id == current_user.id,
            PairingRequest.status == "pending",
            PairingRequest.id != pairing_request.id,
        )
    )
    other_pending_requests = other_pending_result.scalars().all()
    for pending in other_pending_requests:
        pending.status = "rejected"
        pending.responded_at = now

    await session.commit()
    await session.refresh(pairing_request)

    requester = await session.get(User, pairing_request.requester_user_id)
    creator_status = PairingStatusOut(paired=True, partner=user_to_partner(requester))
    creator = await session.get(User, pairing_request.creator_user_id)
    requester_status = PairingStatusOut(paired=True, partner=user_to_partner(creator))
    request_out = await request_to_out(session, pairing_request)

    await connection_manager.send_to_user(
        pairing_request.requester_user_id,
        pairing_event("pairing.request_resolved", request_out, requester_status),
    )
    await connection_manager.send_to_user(
        pairing_request.creator_user_id,
        pairing_event("pairing.request_resolved", request_out, creator_status),
    )
    for pending in other_pending_requests:
        await session.refresh(pending)
        rejected_out = await request_to_out(session, pending)
        await connection_manager.send_to_user(
            pending.requester_user_id,
            pairing_event("pairing.request_resolved", rejected_out),
        )
    return creator_status


@router.post("/requests/{request_id}/reject", response_model=PairingRequestOut)
async def reject_pairing_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    pairing_request = await session.get(PairingRequest, request_id)
    if (
        pairing_request is None
        or pairing_request.creator_user_id != current_user.id
        or pairing_request.status != "pending"
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pairing request not found")

    pairing_request.status = "rejected"
    pairing_request.responded_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(pairing_request)

    request_out = await request_to_out(session, pairing_request)
    await connection_manager.send_to_user(
        pairing_request.requester_user_id,
        pairing_event("pairing.request_resolved", request_out),
    )
    return request_out


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
        partner=user_to_partner(partner),
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
        partner=user_to_partner(partner),
    )
