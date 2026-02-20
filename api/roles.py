from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization_role import OrganizationRole
from models.organization_role_permission import OrganizationRolePermission
from models.permission import Permission
from models.project_role import ProjectRole
from models.project_role_permission import ProjectRolePermission
from schemas.schemas import RoleCreate, RoleOut, RolePermissionOut, RolePermissionUpdate
from services.context import WorkspaceContext, require_org_context
from services.permissions import require_permission

router = APIRouter()


@router.get("/organization", response_model=list[RoleOut])
async def list_organization_roles(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_roles")
    rows = (
        await db.execute(
            select(OrganizationRole)
            .where(OrganizationRole.organization_id == ctx.organization_id)
            .order_by(OrganizationRole.is_builtin.desc(), OrganizationRole.name.asc())
        )
    ).scalars().all()
    return [RoleOut.model_validate(r) for r in rows]


@router.post("/organization", response_model=RoleOut, status_code=201)
async def create_organization_role(
    body: RoleCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_roles")
    existing = (
        await db.execute(
            select(OrganizationRole).where(
                OrganizationRole.organization_id == ctx.organization_id,
                OrganizationRole.slug == body.slug,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Organization role slug already exists")

    role = OrganizationRole(
        organization_id=ctx.organization_id,
        name=body.name,
        slug=body.slug,
        is_builtin=False,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.get("/project", response_model=list[RoleOut])
async def list_project_roles(
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "projects.manage_roles")
    rows = (
        await db.execute(
            select(ProjectRole)
            .where(ProjectRole.organization_id == ctx.organization_id)
            .order_by(ProjectRole.is_builtin.desc(), ProjectRole.name.asc())
        )
    ).scalars().all()
    return [RoleOut.model_validate(r) for r in rows]


@router.post("/project", response_model=RoleOut, status_code=201)
async def create_project_role(
    body: RoleCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "projects.manage_roles")
    existing = (
        await db.execute(
            select(ProjectRole).where(
                ProjectRole.organization_id == ctx.organization_id,
                ProjectRole.slug == body.slug,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Project role slug already exists")

    role = ProjectRole(
        organization_id=ctx.organization_id,
        name=body.name,
        slug=body.slug,
        is_builtin=False,
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.put("/organization/{role_id}/permissions")
async def set_organization_role_permissions(
    role_id: int,
    body: list[RolePermissionUpdate],
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    role = await db.get(OrganizationRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Organization role not found")

    await db.execute(
        delete(OrganizationRolePermission).where(OrganizationRolePermission.role_id == role_id)
    )
    for item in body:
        perm = await db.get(Permission, item.permission_id)
        if not perm:
            raise HTTPException(404, f"Permission not found: {item.permission_id}")
        db.add(
            OrganizationRolePermission(
                role_id=role_id,
                permission_id=item.permission_id,
                effect=item.effect,
            )
        )
    await db.commit()
    return {"ok": True}


@router.get("/organization/{role_id}/permissions", response_model=list[RolePermissionOut])
async def list_organization_role_permissions(
    role_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    role = await db.get(OrganizationRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Organization role not found")

    rows = (
        await db.execute(
            select(OrganizationRolePermission).where(
                OrganizationRolePermission.role_id == role_id
            )
        )
    ).scalars().all()
    return [
        RolePermissionOut(permission_id=row.permission_id, effect=row.effect)
        for row in rows
    ]


@router.put("/project/{role_id}/permissions")
async def set_project_role_permissions(
    role_id: int,
    body: list[RolePermissionUpdate],
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    role = await db.get(ProjectRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Project role not found")

    await db.execute(
        delete(ProjectRolePermission).where(ProjectRolePermission.role_id == role_id)
    )
    for item in body:
        perm = await db.get(Permission, item.permission_id)
        if not perm:
            raise HTTPException(404, f"Permission not found: {item.permission_id}")
        db.add(
            ProjectRolePermission(
                role_id=role_id,
                permission_id=item.permission_id,
                effect=item.effect,
            )
        )
    await db.commit()
    return {"ok": True}


@router.get("/project/{role_id}/permissions", response_model=list[RolePermissionOut])
async def list_project_role_permissions(
    role_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_permissions")
    role = await db.get(ProjectRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Project role not found")

    rows = (
        await db.execute(
            select(ProjectRolePermission).where(
                ProjectRolePermission.role_id == role_id
            )
        )
    ).scalars().all()
    return [
        RolePermissionOut(permission_id=row.permission_id, effect=row.effect)
        for row in rows
    ]
