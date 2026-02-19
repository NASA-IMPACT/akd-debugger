from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
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
from services.permissions import require_permission
from services.security import generate_token, hash_token, normalize_email

router = APIRouter()


def _to_out(inv: Invitation, raw_token: str | None = None) -> InvitationOut:
    link = None
    if raw_token:
        link = f"{get_settings().FRONTEND_BASE_URL}/signup?invitation_token={raw_token}"
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
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_invites")

    for assignment in body.project_assignments:
        project = await db.get(Project, assignment.project_id)
        if not project or project.organization_id != ctx.organization_id:
            raise HTTPException(400, f"Invalid project assignment: {assignment.project_id}")

    raw_token = generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=get_settings().INVITE_TTL_DAYS)

    inv = Invitation(
        organization_id=ctx.organization_id,
        email=normalize_email(body.email),
        invited_by_user_id=ctx.user.id,
        token_hash=hash_token(raw_token),
        org_role_id=body.org_role_id,
        project_assignments=[a.model_dump() for a in body.project_assignments],
        expires_at=expires_at,
        accepted_at=None,
        revoked_at=None,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    return _to_out(inv, raw_token)


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
                role_id=inv.org_role_id,
                is_active=True,
            )
        )

    for assignment in inv.project_assignments or []:
        project_id = assignment.get("project_id")
        role_id = assignment.get("role_id")
        if not isinstance(project_id, int):
            continue
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
            continue
        db.add(
            ProjectMembership(
                organization_id=inv.organization_id,
                project_id=project_id,
                user_id=user.id,
                role_id=role_id if isinstance(role_id, int) else None,
                is_active=True,
            )
        )

    inv.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inv)
    return _to_out(inv)
