from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization import Organization
from models.organization_membership import OrganizationMembership
from models.user import User
from schemas.schemas import (
    MembershipCreate,
    MembershipOut,
    OrganizationCreate,
    OrganizationOut,
    OrganizationUpdate,
)
from services.context import WorkspaceContext, get_current_user, require_org_context
from services.permissions import get_role_by_slug, require_permission
from services.workspaces import create_organization_with_defaults

router = APIRouter()


def _membership_out(row: OrganizationMembership, user: User | None = None) -> MembershipOut:
    return MembershipOut(
        id=row.id,
        organization_id=row.organization_id,
        user_id=row.user_id,
        user_full_name=user.full_name if user else None,
        user_email=user.email if user else None,
        role_id=row.role_id,
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.get("", response_model=list[OrganizationOut])
async def list_organizations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.is_active.is_(True),
        )
        .order_by(Organization.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [OrganizationOut.model_validate(row) for row in rows]


@router.post("", response_model=OrganizationOut, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await create_organization_with_defaults(
        db,
        name=body.name,
        owner_user_id=user.id,
        is_personal=False,
    )
    return OrganizationOut.model_validate(org)


@router.get("/current", response_model=OrganizationOut)
async def get_current_organization(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, ctx.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return OrganizationOut.model_validate(org)


@router.put("/current", response_model=OrganizationOut)
async def update_current_organization(
    body: OrganizationUpdate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.write")
    org = await db.get(Organization, ctx.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(org, key, value)
    await db.commit()
    await db.refresh(org)
    return OrganizationOut.model_validate(org)


@router.delete("/current", status_code=204)
async def delete_current_organization(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.delete")
    org = await db.get(Organization, ctx.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    if org.is_personal:
        raise HTTPException(400, "Personal organizations cannot be deleted")
    await db.delete(org)
    await db.commit()


@router.get("/current/members", response_model=list[MembershipOut])
async def list_current_org_members(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_members")
    stmt = (
        select(OrganizationMembership, User)
        .join(User, User.id == OrganizationMembership.user_id)
        .where(
            OrganizationMembership.organization_id == ctx.organization_id,
            OrganizationMembership.is_active.is_(True),
        )
        .order_by(User.full_name.asc(), User.email.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [_membership_out(membership, user) for membership, user in rows]


@router.post("/current/members", response_model=MembershipOut, status_code=201)
async def add_current_org_member(
    body: MembershipCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_members")
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(404, "User not found")

    existing = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.user_id == body.user_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "User is already a member of this organization")

    role_id = body.role_id
    if role_id is None:
        role = await get_role_by_slug(
            db,
            organization_id=ctx.organization_id,
            role_type="organization",
            slug="org_user",
        )
        role_id = role.id if role else None

    membership = OrganizationMembership(
        organization_id=ctx.organization_id,
        user_id=body.user_id,
        role_id=role_id,
        is_active=True,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return _membership_out(membership, user)


@router.delete("/current/members/{user_id}", status_code=204)
async def remove_current_org_member(
    user_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_members")
    membership = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Organization membership not found")
    await db.delete(membership)
    await db.commit()
