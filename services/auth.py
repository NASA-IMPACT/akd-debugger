from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.auth_session import AuthSession
from models.user import User
from services.security import generate_token, hash_token, verify_password

ACCESS_COOKIE_NAME = "axiom_access_token"
REFRESH_COOKIE_NAME = "axiom_refresh_token"


@dataclass
class SessionPair:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _cookie_params() -> dict:
    settings = get_settings()
    return {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": "lax",
        "domain": settings.SESSION_COOKIE_DOMAIN,
        "path": "/",
    }


async def issue_session_pair(db: AsyncSession, user: User, request: Request | None = None) -> SessionPair:
    settings = get_settings()
    now = _utcnow()
    access_token = generate_token()
    refresh_token = generate_token()
    access_expires = now + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)
    refresh_expires = now + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)

    ua = request.headers.get("user-agent") if request else None
    ip = request.client.host if request and request.client else None

    db.add(
        AuthSession(
            user_id=user.id,
            session_type="access",
            token_hash=hash_token(access_token),
            expires_at=access_expires,
            created_ip=ip,
            user_agent=ua,
        )
    )
    db.add(
        AuthSession(
            user_id=user.id,
            session_type="refresh",
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires,
            created_ip=ip,
            user_agent=ua,
        )
    )
    await db.commit()

    return SessionPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_at=access_expires,
        refresh_expires_at=refresh_expires,
    )


def set_session_cookies(response: Response, pair: SessionPair) -> None:
    params = _cookie_params()
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        pair.access_token,
        expires=pair.access_expires_at,
        **params,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        pair.refresh_token,
        expires=pair.refresh_expires_at,
        **params,
    )


def clear_session_cookies(response: Response) -> None:
    params = _cookie_params()
    response.delete_cookie(ACCESS_COOKIE_NAME, path=params["path"], domain=params["domain"])
    response.delete_cookie(REFRESH_COOKIE_NAME, path=params["path"], domain=params["domain"])


async def _get_session_by_token(
    db: AsyncSession,
    token: str,
    session_type: str,
) -> AuthSession | None:
    hashed = hash_token(token)
    stmt = select(AuthSession).where(
        AuthSession.token_hash == hashed,
        AuthSession.session_type == session_type,
        AuthSession.revoked_at.is_(None),
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        return None
    if session.expires_at <= _utcnow():
        return None
    return session


async def get_user_from_access_cookie(request: Request, db: AsyncSession) -> User | None:
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None
    session = await _get_session_by_token(db, token, "access")
    if not session:
        return None
    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        return None
    session.last_used_at = _utcnow()
    await db.commit()
    return user


async def require_user(request: Request, db: AsyncSession) -> User:
    user = await get_user_from_access_cookie(request, db)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


async def authenticate_credentials(db: AsyncSession, email: str, password: str) -> User:
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return user


async def revoke_token(db: AsyncSession, token: str, session_type: str) -> None:
    session = await _get_session_by_token(db, token, session_type)
    if session and session.revoked_at is None:
        session.revoked_at = _utcnow()
        await db.commit()


async def revoke_user_sessions(db: AsyncSession, user_id: int) -> int:
    now = _utcnow()
    stmt = (
        select(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    )
    sessions = (await db.execute(stmt)).scalars().all()
    for s in sessions:
        s.revoked_at = now
    await db.commit()
    return len(sessions)


async def rotate_access_from_refresh(
    db: AsyncSession,
    refresh_token: str,
    request: Request | None = None,
) -> tuple[User, SessionPair]:
    refresh_session = await _get_session_by_token(db, refresh_token, "refresh")
    if not refresh_session:
        raise HTTPException(401, "Invalid refresh session")
    user = await db.get(User, refresh_session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "User is inactive")

    # Revoke all previous access sessions for this user to keep a short-lived single-session model.
    await db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.session_type == "access",
        )
    )
    await db.commit()

    pair = await issue_session_pair(db, user, request=request)
    return user, pair
