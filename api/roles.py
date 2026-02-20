from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.invitation import Invitation
from models.organization_membership import OrganizationMembership
from models.organization_role import OrganizationRole
from models.organization_role_permission import OrganizationRolePermission
from models.permission import Permission
from models.project_membership import ProjectMembership
from models.project_role import ProjectRole
from models.project_role_permission import ProjectRolePermission
from schemas.schemas import RoleCreate, RoleOut, RolePermissionOut, RolePermissionUpdate
from services.context import WorkspaceContext, require_org_context
from services.permissions import require_permission

router = APIRouter()
PROTECTED_ORGANIZATION_ROLE_SLUGS = {"org_admin", "org_user"}
PROTECTED_PROJECT_ROLE_SLUGS = {"project_admin", "project_user"}


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


@router.delete("/organization/{role_id}", status_code=204, response_class=Response)
async def delete_organization_role(
    role_id: int,
    replacement_role_id: int | None = Query(default=None),
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "organizations.manage_roles")
    role = await db.get(OrganizationRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Organization role not found")
    if role.slug in PROTECTED_ORGANIZATION_ROLE_SLUGS:
        raise HTTPException(400, "Default organization roles cannot be deleted")
    if role.is_builtin:
        raise HTTPException(400, "Built-in organization roles cannot be deleted")

    replacement: OrganizationRole | None = None
    if replacement_role_id is not None:
        replacement = await db.get(OrganizationRole, replacement_role_id)
        if not replacement or replacement.organization_id != ctx.organization_id:
            raise HTTPException(400, "Invalid replacement organization role")
        if replacement.id == role.id:
            raise HTTPException(400, "Replacement role must be different from the role being deleted")

    active_memberships_count = (
        await db.execute(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.role_id == role.id,
                OrganizationMembership.is_active.is_(True),
            )
        )
    ).scalar_one()
    if active_memberships_count > 0 and replacement is None:
        raise HTTPException(400, "Role is assigned to active users. Provide replacement_role_id to reassign before deletion.")

    if replacement is not None:
        await db.execute(
            update(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.role_id == role.id,
            )
            .values(role_id=replacement.id)
        )
        await db.execute(
            update(Invitation)
            .where(
                Invitation.organization_id == ctx.organization_id,
                Invitation.org_role_id == role.id,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
            )
            .values(org_role_id=replacement.id)
        )

    await db.delete(role)
    await db.commit()


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


@router.delete("/project/{role_id}", status_code=204, response_class=Response)
async def delete_project_role(
    role_id: int,
    replacement_role_id: int | None = Query(default=None),
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "projects.manage_roles")
    role = await db.get(ProjectRole, role_id)
    if not role or role.organization_id != ctx.organization_id:
        raise HTTPException(404, "Project role not found")
    if role.slug in PROTECTED_PROJECT_ROLE_SLUGS:
        raise HTTPException(400, "Default project roles cannot be deleted")
    if role.is_builtin:
        raise HTTPException(400, "Built-in project roles cannot be deleted")

    replacement: ProjectRole | None = None
    if replacement_role_id is not None:
        replacement = await db.get(ProjectRole, replacement_role_id)
        if not replacement or replacement.organization_id != ctx.organization_id:
            raise HTTPException(400, "Invalid replacement project role")
        if replacement.id == role.id:
            raise HTTPException(400, "Replacement role must be different from the role being deleted")

    active_memberships_count = (
        await db.execute(
            select(func.count(ProjectMembership.id)).where(
                ProjectMembership.organization_id == ctx.organization_id,
                ProjectMembership.role_id == role.id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalar_one()
    if active_memberships_count > 0 and replacement is None:
        raise HTTPException(400, "Role is assigned to active users. Provide replacement_role_id to reassign before deletion.")

    if replacement is not None:
        await db.execute(
            update(ProjectMembership)
            .where(
                ProjectMembership.organization_id == ctx.organization_id,
                ProjectMembership.role_id == role.id,
            )
            .values(role_id=replacement.id)
        )

    pending_invitations = (
        await db.execute(
            select(Invitation).where(
                Invitation.organization_id == ctx.organization_id,
                Invitation.accepted_at.is_(None),
                Invitation.revoked_at.is_(None),
            )
        )
    ).scalars().all()
    replacement_id = replacement.id if replacement else None
    for invitation in pending_invitations:
        assignments = invitation.project_assignments or []
        updated_assignments: list[dict] = []
        changed = False
        for assignment in assignments:
            role_value = assignment.get("role_id")
            if isinstance(role_value, int) and role_value == role.id:
                next_assignment = dict(assignment)
                next_assignment["role_id"] = replacement_id
                updated_assignments.append(next_assignment)
                changed = True
            else:
                updated_assignments.append(assignment)
        if changed:
            invitation.project_assignments = updated_assignments

    await db.delete(role)
    await db.commit()


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
