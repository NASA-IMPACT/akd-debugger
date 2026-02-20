from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization_membership import OrganizationMembership
from models.permission import Permission
from models.project import Project
from models.user import User
from models.user_permission_grant import UserPermissionGrant
from schemas.schemas import PermissionOut, UserPermissionGrantCreate, UserPermissionGrantOut
from services.context import WorkspaceContext, require_org_context
from services.permissions import require_permission

router = APIRouter()


@router.get("", response_model=list[PermissionOut])
async def list_permissions(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    rows = (await db.execute(select(Permission).order_by(Permission.resource, Permission.action))).scalars().all()
    return [PermissionOut.model_validate(r) for r in rows]


@router.get("/grants", response_model=list[UserPermissionGrantOut])
async def list_user_grants(
    user_id: int | None = None,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    stmt = select(UserPermissionGrant).where(
        UserPermissionGrant.organization_id == ctx.organization_id
    )
    if user_id is not None:
        stmt = stmt.where(UserPermissionGrant.user_id == user_id)
    stmt = stmt.order_by(UserPermissionGrant.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [UserPermissionGrantOut.model_validate(r) for r in rows]


@router.post("/grants", response_model=UserPermissionGrantOut, status_code=201)
async def create_user_grant(
    body: UserPermissionGrantCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")

    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    org_membership = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.user_id == body.user_id,
                OrganizationMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not org_membership:
        raise HTTPException(400, "User must be an active organization member before adding grants")

    permission = await db.get(Permission, body.permission_id)
    if not permission:
        raise HTTPException(404, "Permission not found")

    if body.project_id is not None:
        project = await db.get(Project, body.project_id)
        if not project or project.organization_id != ctx.organization_id:
            raise HTTPException(400, "Invalid project_id for this organization")
    if (body.resource_type is None) != (body.resource_id is None):
        raise HTTPException(400, "resource_type and resource_id must both be set or both be null")

    grant = UserPermissionGrant(
        organization_id=ctx.organization_id,
        project_id=body.project_id,
        user_id=body.user_id,
        permission_id=body.permission_id,
        effect=body.effect,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        granted_by_user_id=ctx.user.id,
        expires_at=body.expires_at,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return UserPermissionGrantOut.model_validate(grant)


@router.delete("/grants/{grant_id}", status_code=204)
async def delete_user_grant(
    grant_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    grant = await db.get(UserPermissionGrant, grant_id)
    if not grant or grant.organization_id != ctx.organization_id:
        raise HTTPException(404, "Grant not found")
    await db.delete(grant)
    await db.commit()
