import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_db_session,
    get_user_by_phone_number,
    get_user_by_username,
)
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models import SharingSettings, SmsVerificationCode, User
from app.schemas import (
    AuthRequest,
    PasswordResetRequest,
    RegisterRequest,
    SmsCodeSendRequest,
    SmsCodeSendResponse,
    SmsLoginRequest,
    SmsRegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.services.sms import is_sms_debug_mode, send_sms_code

router = APIRouter(prefix="/auth", tags=["auth"])


def normalize_phone_number(value: str) -> str:
    raw = value.strip().replace(" ", "").replace("-", "")
    if raw.startswith("+"):
        digits = "".join(ch for ch in raw[1:] if ch.isdigit())
        return f"+{digits}"

    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        return f"+86{digits}"
    return digits


def issue_token(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserPublic.model_validate(user),
    )


def make_sms_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def consume_sms_code(
    session: AsyncSession,
    phone_number: str,
    purpose: str,
    code: str,
) -> None:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(SmsVerificationCode)
        .where(
            SmsVerificationCode.phone_number == phone_number,
            SmsVerificationCode.purpose == purpose,
            SmsVerificationCode.consumed_at.is_(None),
        )
        .order_by(SmsVerificationCode.sent_at.desc())
        .limit(5)
    )
    records = result.scalars().all()
    for record in records:
        record.attempts += 1
        if aware_utc(record.expires_at) < now:
            continue
        if verify_password(code, record.code_hash):
            record.consumed_at = now
            await session.flush()
            return

    await session.flush()
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SMS code")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: AsyncSession = Depends(get_db_session)):
    username = payload.username.strip().lower()
    existing_user = await get_user_by_username(session, username)
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=username,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    await session.flush()
    session.add(SharingSettings(user_id=user.id, enabled=True))
    await session.commit()
    await session.refresh(user)

    return issue_token(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: AuthRequest, session: AsyncSession = Depends(get_db_session)):
    username = payload.username.strip().lower()
    user = await get_user_by_username(session, username)
    if user is None:
        phone_number = normalize_phone_number(payload.username)
        if phone_number != username:
            user = await get_user_by_phone_number(session, phone_number)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    return issue_token(user)


@router.post("/sms/send", response_model=SmsCodeSendResponse)
async def send_code(
    payload: SmsCodeSendRequest,
    session: AsyncSession = Depends(get_db_session),
):
    settings = get_settings()
    phone_number = normalize_phone_number(payload.phone_number)
    if len(phone_number) < 5:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid phone number")

    existing_user = await get_user_by_phone_number(session, phone_number)
    if payload.purpose == "register" and existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already exists")
    if payload.purpose in {"login", "reset_password"} and existing_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phone number is not registered")

    now = datetime.now(timezone.utc)
    latest_result = await session.execute(
        select(SmsVerificationCode)
        .where(
            SmsVerificationCode.phone_number == phone_number,
            SmsVerificationCode.purpose == payload.purpose,
        )
        .order_by(SmsVerificationCode.sent_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    if latest is not None:
        seconds_since_last = (now - aware_utc(latest.sent_at)).total_seconds()
        remaining = settings.sms_resend_cooldown_seconds - int(seconds_since_last)
        if remaining > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting another code",
            )

    code = make_sms_code()
    expires_at = now + timedelta(minutes=settings.sms_code_expire_minutes)
    record = SmsVerificationCode(
        phone_number=phone_number,
        purpose=payload.purpose,
        code_hash=hash_password(code),
        expires_at=expires_at,
        sent_at=now,
        attempts=0,
    )
    session.add(record)
    try:
        await send_sms_code(phone_number, code, payload.purpose)
    except RuntimeError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    await session.commit()

    return SmsCodeSendResponse(
        phone_number=phone_number,
        purpose=payload.purpose,
        expires_at=expires_at,
        resend_after_seconds=settings.sms_resend_cooldown_seconds,
        debug_code=code if is_sms_debug_mode() else None,
    )


@router.post("/sms/login", response_model=TokenResponse)
async def sms_login(payload: SmsLoginRequest, session: AsyncSession = Depends(get_db_session)):
    phone_number = normalize_phone_number(payload.phone_number)
    user = await get_user_by_phone_number(session, phone_number)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phone number is not registered")

    await consume_sms_code(session, phone_number, "login", payload.code.strip())
    await session.commit()
    await session.refresh(user)
    return issue_token(user)


@router.post("/sms/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def sms_register(
    payload: SmsRegisterRequest,
    session: AsyncSession = Depends(get_db_session),
):
    phone_number = normalize_phone_number(payload.phone_number)
    existing_user = await get_user_by_phone_number(session, phone_number)
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number already exists")

    await consume_sms_code(session, phone_number, "register", payload.code.strip())
    user = User(
        username=phone_number,
        phone_number=phone_number,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    await session.flush()
    session.add(SharingSettings(user_id=user.id, enabled=True))
    await session.commit()
    await session.refresh(user)
    return issue_token(user)


@router.post("/password/reset", response_model=TokenResponse)
async def reset_password(
    payload: PasswordResetRequest,
    session: AsyncSession = Depends(get_db_session),
):
    phone_number = normalize_phone_number(payload.phone_number)
    user = await get_user_by_phone_number(session, phone_number)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phone number is not registered")

    await consume_sms_code(session, phone_number, "reset_password", payload.code.strip())
    user.password_hash = hash_password(payload.new_password)
    await session.commit()
    await session.refresh(user)
    return issue_token(user)


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
