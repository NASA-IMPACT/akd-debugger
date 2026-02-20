from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.invitation import Invitation
from models.organization_membership import OrganizationMembership
from models.project import Project
from models.project_membership import ProjectMembership
from schemas.schemas import InvitationAcceptIn, InvitationCreate, InvitationOut
from services.context import WorkspaceContext, get_current_user, require_org_context
from services.permissions import get_role_by_id, get_role_by_slug, require_permission
from services.security import generate_token, hash_token, normalize_email

router = APIRouter()


def _request_frontend_base_url(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    return None


def _to_out(
    inv: Invitation,
    raw_token: str | None = None,
    *,
    frontend_base_url: str | None = None,
) -> InvitationOut:
    link = None
    if raw_token:
        base_url = (frontend_base_url or get_settings().FRONTEND_BASE_URL).rstrip("/")
        link = f"{base_url}/signup?invitation_token={raw_token}"
    return InvitationOut(
        id=inv.id,
        organization_id=inv.organization_id,
        email=inv.email,
        invited_by_user_id=inv.invited_by_user_id,
        org_role_id=inv.org_role_id,
        project_assignments=inv.project_assignments or [],
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        revoked_at=inv.revoked_at,
        created_at=inv.created_at,
        invite_link=link,
    )


@router.get("", response_model=list[InvitationOut])
async def list_invitations(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_invites")
    stmt = (
        select(Invitation)
        .where(Invitation.organization_id == ctx.organization_id)
        .order_by(Invitation.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=InvitationOut, status_code=201)
async def create_invitation(
    body: InvitationCreate,
    request: Request,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_invites")

    org_role_id = body.org_role_id
    if org_role_id is None:
        default_org_role = await get_role_by_slug(
            db,
            organization_id=ctx.organization_id,
            role_type="organization",
            slug="org_user",
        )
        org_role_id = default_org_role.id if default_org_role else None
    else:
        scoped_org_role = await get_role_by_id(
            db,
            organization_id=ctx.organization_id,
            role_type="organization",
            role_id=org_role_id,
        )
        if not scoped_org_role:
            raise HTTPException(400, "Invalid organization role for this organization")

    default_project_role_id: int | None = None
    project_assignments: list[dict] = []
    for assignment in body.project_assignments:
        project = await db.get(Project, assignment.project_id)
        if not project or project.organization_id != ctx.organization_id:
            raise HTTPException(400, f"Invalid project assignment: {assignment.project_id}")
        role_id = assignment.role_id
        if role_id is None:
            if default_project_role_id is None:
                default_project_role = await get_role_by_slug(
                    db,
                    organization_id=ctx.organization_id,
                    role_type="project",
                    slug="project_user",
                )
                default_project_role_id = default_project_role.id if default_project_role else None
            role_id = default_project_role_id
        else:
            scoped_project_role = await get_role_by_id(
                db,
                organization_id=ctx.organization_id,
                role_type="project",
                role_id=role_id,
            )
            if not scoped_project_role:
                raise HTTPException(400, f"Invalid role_id for project assignment: {assignment.project_id}")
        project_assignments.append(
            {
                "project_id": assignment.project_id,
                "role_id": role_id,
            }
        )

    raw_token = generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=get_settings().INVITE_TTL_DAYS)

    inv = Invitation(
        organization_id=ctx.organization_id,
        email=normalize_email(body.email),
        invited_by_user_id=ctx.user.id,
        token_hash=hash_token(raw_token),
        org_role_id=org_role_id,
        project_assignments=project_assignments,
        expires_at=expires_at,
        accepted_at=None,
        revoked_at=None,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    return _to_out(
        inv,
        raw_token,
        frontend_base_url=_request_frontend_base_url(request),
    )


@router.post("/{invitation_id}/revoke", response_model=InvitationOut)
async def revoke_invitation(
    invitation_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_invites")
    inv = await db.get(Invitation, invitation_id)
    if not inv or inv.organization_id != ctx.organization_id:
        raise HTTPException(404, "Invitation not found")
    if inv.revoked_at is None:
        inv.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inv)
    return _to_out(inv)


@router.post("/accept", response_model=InvitationOut)
async def accept_invitation(
    body: InvitationAcceptIn,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inv = (
        await db.execute(select(Invitation).where(Invitation.token_hash == hash_token(body.token)))
    ).scalar_one_or_none()
    if not inv or inv.revoked_at is not None or inv.accepted_at is not None:
        raise HTTPException(400, "Invitation is invalid")

    if inv.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "Invitation has expired")

    if normalize_email(inv.email) != normalize_email(user.email):
        raise HTTPException(400, "Invitation email does not match current account")

    role_id = inv.org_role_id
    if role_id is None:
        default_org_role = await get_role_by_slug(
            db,
            organization_id=inv.organization_id,
            role_type="organization",
            slug="org_user",
        )
        role_id = default_org_role.id if default_org_role else None
    else:
        scoped_org_role = await get_role_by_id(
            db,
            organization_id=inv.organization_id,
            role_type="organization",
            role_id=role_id,
        )
        if not scoped_org_role:
            default_org_role = await get_role_by_slug(
                db,
                organization_id=inv.organization_id,
                role_type="organization",
                slug="org_user",
            )
            role_id = default_org_role.id if default_org_role else None

    org_membership = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == inv.organization_id,
                OrganizationMembership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not org_membership:
        db.add(
            OrganizationMembership(
                organization_id=inv.organization_id,
                user_id=user.id,
                role_id=role_id,
                is_active=True,
            )
        )
    else:
        if not org_membership.is_active:
            org_membership.is_active = True
        if org_membership.role_id is None and role_id is not None:
            org_membership.role_id = role_id

    default_project_role_id: int | None = None

    for assignment in inv.project_assignments or []:
        project_id = assignment.get("project_id")
        assignment_role_id = assignment.get("role_id")
        if not isinstance(project_id, int):
            continue
        project = await db.get(Project, project_id)
        if not project or project.organization_id != inv.organization_id:
            continue
        resolved_project_role_id: int | None = assignment_role_id if isinstance(assignment_role_id, int) else None
        if resolved_project_role_id is not None:
            scoped_project_role = await get_role_by_id(
                db,
                organization_id=inv.organization_id,
                role_type="project",
                role_id=resolved_project_role_id,
            )
            if not scoped_project_role:
                resolved_project_role_id = None
        if resolved_project_role_id is None:
            if default_project_role_id is None:
                default_project_role = await get_role_by_slug(
                    db,
                    organization_id=inv.organization_id,
                    role_type="project",
                    slug="project_user",
                )
                default_project_role_id = default_project_role.id if default_project_role else None
            resolved_project_role_id = default_project_role_id
        pm = (
            await db.execute(
                select(ProjectMembership).where(
                    ProjectMembership.organization_id == inv.organization_id,
                    ProjectMembership.project_id == project_id,
                    ProjectMembership.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if pm:
            if not pm.is_active:
                pm.is_active = True
            if pm.role_id is None and resolved_project_role_id is not None:
                pm.role_id = resolved_project_role_id
            continue
        db.add(
            ProjectMembership(
                organization_id=inv.organization_id,
                project_id=project_id,
                user_id=user.id,
                role_id=resolved_project_role_id,
                is_active=True,
            )
        )

    inv.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inv)
    return _to_out(inv)
