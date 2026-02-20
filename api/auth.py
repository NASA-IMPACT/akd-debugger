from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.invitation import Invitation
from models.organization import Organization
from models.organization_membership import OrganizationMembership
from models.password_reset_token import PasswordResetToken
from models.project import Project
from models.project_membership import ProjectMembership
from models.user import User
from schemas.schemas import (
    AuthAdminPasswordResetIn,
    AuthLoginIn,
    AuthPasswordForgotIn,
    AuthPasswordResetIn,
    AuthSessionOut,
    AuthSignupIn,
    OrganizationOut,
    UserOut,
)
from services.auth import (
    REFRESH_COOKIE_NAME,
    authenticate_credentials,
    clear_session_cookies,
    get_user_from_access_cookie,
    issue_session_pair,
    revoke_token,
    rotate_access_from_refresh,
    set_session_cookies,
)
from services.context import WorkspaceContext, require_org_context
from services.permissions import get_role_by_id, get_role_by_slug, require_permission
from services.security import generate_token, hash_password, hash_token, normalize_email
from services.workspaces import create_organization_with_defaults

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_user_organizations(db: AsyncSession, user_id: int) -> list[OrganizationOut]:
    stmt = (
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.is_active.is_(True),
        )
        .order_by(Organization.created_at.asc())
    )
    orgs = (await db.execute(stmt)).scalars().all()
    return [OrganizationOut.model_validate(org) for org in orgs]


async def _session_payload(db: AsyncSession, user: User) -> AuthSessionOut:
    orgs = await _load_user_organizations(db, user.id)

    active_org_id: int | None = None
    if orgs:
        personal_owned_org = next(
            (
                org
                for org in orgs
                if org.is_personal and org.owner_user_id == user.id
            ),
            None,
        )
        owned_org = next((org for org in orgs if org.owner_user_id == user.id), None)
        active_org_id = (personal_owned_org or owned_org or orgs[0]).id

    return AuthSessionOut(
        user=UserOut.model_validate(user),
        organizations=orgs,
        active_organization_id=active_org_id,
    )


@router.post("/signup", response_model=AuthSessionOut, status_code=201)
async def signup(
    body: AuthSignupIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    email = normalize_email(body.email)
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "A user with this email already exists")

    invitation: Invitation | None = None
    if body.invitation_token:
        invitation = (
            await db.execute(
                select(Invitation).where(Invitation.token_hash == hash_token(body.invitation_token))
            )
        ).scalar_one_or_none()
        if not invitation or invitation.revoked_at is not None or invitation.accepted_at is not None:
            raise HTTPException(400, "Invitation token is invalid")
        if invitation.expires_at <= _utcnow():
            raise HTTPException(400, "Invitation token has expired")
        if normalize_email(invitation.email) != email:
            raise HTTPException(400, "Invitation email does not match signup email")

    user = User(
        full_name=body.full_name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Personal organization by default.
    await create_organization_with_defaults(
        db,
        name="Default",
        owner_user_id=user.id,
        is_personal=True,
    )

    if invitation:
        role_id = invitation.org_role_id
        if role_id is None:
            default_org_role = await get_role_by_slug(
                db,
                organization_id=invitation.organization_id,
                role_type="organization",
                slug="org_user",
            )
            role_id = default_org_role.id if default_org_role else None
        else:
            scoped_org_role = await get_role_by_id(
                db,
                organization_id=invitation.organization_id,
                role_type="organization",
                role_id=role_id,
            )
            if not scoped_org_role:
                default_org_role = await get_role_by_slug(
                    db,
                    organization_id=invitation.organization_id,
                    role_type="organization",
                    slug="org_user",
                )
                role_id = default_org_role.id if default_org_role else None
        existing_membership = (
            await db.execute(
                select(OrganizationMembership).where(
                    OrganizationMembership.organization_id == invitation.organization_id,
                    OrganizationMembership.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not existing_membership:
            db.add(
                OrganizationMembership(
                    organization_id=invitation.organization_id,
                    user_id=user.id,
                    role_id=role_id,
                    is_active=True,
                )
            )
        else:
            if not existing_membership.is_active:
                existing_membership.is_active = True
            if existing_membership.role_id is None and role_id is not None:
                existing_membership.role_id = role_id

        default_project_role_id: int | None = None

        for assignment in invitation.project_assignments or []:
            project_id = assignment.get("project_id")
            project_role_id = assignment.get("role_id")
            if not isinstance(project_id, int):
                continue
            project = await db.get(Project, project_id)
            if not project or project.organization_id != invitation.organization_id:
                continue
            resolved_project_role_id: int | None = project_role_id if isinstance(project_role_id, int) else None
            if resolved_project_role_id is not None:
                scoped_project_role = await get_role_by_id(
                    db,
                    organization_id=invitation.organization_id,
                    role_type="project",
                    role_id=resolved_project_role_id,
                )
                if not scoped_project_role:
                    resolved_project_role_id = None
            if resolved_project_role_id is None:
                if default_project_role_id is None:
                    default_project_role = await get_role_by_slug(
                        db,
                        organization_id=invitation.organization_id,
                        role_type="project",
                        slug="project_user",
                    )
                    default_project_role_id = default_project_role.id if default_project_role else None
                resolved_project_role_id = default_project_role_id
            existing_pm = (
                await db.execute(
                    select(ProjectMembership).where(
                        ProjectMembership.organization_id == invitation.organization_id,
                        ProjectMembership.project_id == project_id,
                        ProjectMembership.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if not existing_pm:
                db.add(
                    ProjectMembership(
                        organization_id=invitation.organization_id,
                        project_id=project_id,
                        user_id=user.id,
                        role_id=resolved_project_role_id,
                        is_active=True,
                    )
                )
            else:
                if not existing_pm.is_active:
                    existing_pm.is_active = True
                if existing_pm.role_id is None and resolved_project_role_id is not None:
                    existing_pm.role_id = resolved_project_role_id

        invitation.accepted_at = _utcnow()

    await db.commit()
    await db.refresh(user)

    pair = await issue_session_pair(db, user, request=request)
    set_session_cookies(response, pair, request=request)
    return await _session_payload(db, user)


@router.post("/login", response_model=AuthSessionOut)
async def login(
    body: AuthLoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_credentials(db, normalize_email(body.email), body.password)
    pair = await issue_session_pair(db, user, request=request)
    set_session_cookies(response, pair, request=request)
    return await _session_payload(db, user)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    access = request.cookies.get("axiom_access_token")
    refresh = request.cookies.get("axiom_refresh_token")
    if access:
        await revoke_token(db, access, "access")
    if refresh:
        await revoke_token(db, refresh, "refresh")
    clear_session_cookies(response)
    return {"ok": True}


@router.post("/refresh", response_model=AuthSessionOut)
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(401, "Refresh cookie is missing")
    user, pair = await rotate_access_from_refresh(db, refresh_token, request=request)
    set_session_cookies(response, pair, request=request)
    return await _session_payload(db, user)


@router.get("/me", response_model=AuthSessionOut)
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_user_from_access_cookie(request, db)
    if not user:
        raise HTTPException(401, "Authentication required")
    return await _session_payload(db, user)


@router.post("/password/forgot")
async def forgot_password(body: AuthPasswordForgotIn, db: AsyncSession = Depends(get_db)):
    email = normalize_email(body.email)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        # Do not leak account existence.
        return {"ok": True}

    raw_token = generate_token()
    expires_at = _utcnow() + timedelta(minutes=get_settings().PASSWORD_RESET_TTL_MINUTES)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
            used_at=None,
            is_admin_reset=False,
        )
    )
    await db.commit()

    link = f"{get_settings().FRONTEND_BASE_URL}/reset-password?token={raw_token}"
    return {"ok": True, "reset_link": link}


@router.post("/password/reset")
async def reset_password(body: AuthPasswordResetIn, db: AsyncSession = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    token_hash = hash_token(body.token)
    token = (
        await db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    ).scalar_one_or_none()
    if not token or token.used_at is not None:
        raise HTTPException(400, "Invalid password reset token")
    if token.expires_at <= _utcnow():
        raise HTTPException(400, "Password reset token has expired")

    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.password_hash = hash_password(body.password)
    token.used_at = _utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/password/admin-reset")
async def admin_reset_password(
    body: AuthAdminPasswordResetIn,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "auth.password_admin_reset")

    membership = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.user_id == body.user_id,
                OrganizationMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Target user is not a member of this organization")

    target_user = await db.get(User, body.user_id)
    if not target_user:
        raise HTTPException(404, "Target user not found")

    temp_password = generate_token()[:14]
    target_user.password_hash = hash_password(temp_password)

    reset_token = generate_token()
    expires_at = _utcnow() + timedelta(minutes=get_settings().PASSWORD_RESET_TTL_MINUTES)
    db.add(
        PasswordResetToken(
            user_id=target_user.id,
            created_by_user_id=ctx.user.id,
            token_hash=hash_token(reset_token),
            expires_at=expires_at,
            used_at=None,
            is_admin_reset=True,
        )
    )
    await db.commit()

    link = f"{get_settings().FRONTEND_BASE_URL}/reset-password?token={reset_token}"
    return {
        "ok": True,
        "temporary_password": temp_password,
        "reset_link": link,
    }
