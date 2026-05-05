from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models import ChatMessage, Couple, User
from app.schemas import ChatMessageIn, ChatMessageOut
from app.services.connection_manager import connection_manager
from app.services.pairing import get_active_couple

router = APIRouter(prefix="/chat", tags=["chat"])


async def require_active_couple(session: AsyncSession, user_id) -> Couple:
    couple = await get_active_couple(session, user_id)
    if couple is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active partner")
    return couple


def get_partner_id(couple: Couple, user_id):
    return couple.user_b_id if couple.user_a_id == user_id else couple.user_a_id


def chat_message_to_event(message: ChatMessage) -> dict:
    return {
        "type": "chat.message_created",
        "message": ChatMessageOut.model_validate(message).model_dump(mode="json"),
    }


@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    couple = await require_active_couple(session, current_user.id)
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.couple_id == couple.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()
    return messages


@router.post("/messages", response_model=ChatMessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: ChatMessageIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    body = payload.body.strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message body cannot be empty",
        )

    status_key = (
        payload.status_key.strip()
        if payload.message_type == "quick_status" and payload.status_key
        else None
    )
    if payload.message_type == "quick_status" and not status_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quick status messages require status_key",
        )

    couple = await require_active_couple(session, current_user.id)
    message = ChatMessage(
        couple_id=couple.id,
        sender_user_id=current_user.id,
        message_type=payload.message_type,
        body=body,
        status_key=status_key,
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)

    await connection_manager.send_to_users(
        [current_user.id, get_partner_id(couple, current_user.id)],
        chat_message_to_event(message),
    )
    return message
