from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.enums import EFFECT_ALLOW, EFFECT_DENY, VISIBILITY_ORGANIZATION
from models.organization_role import OrganizationRole
from models.organization_role_permission import OrganizationRolePermission
from models.permission import Permission
from models.project_role import ProjectRole
from models.project_role_permission import ProjectRolePermission
from models.user_permission_grant import UserPermissionGrant
from services.context import WorkspaceContext
from services.permission_registry import (
    DEFAULT_ORG_ROLE_KEYS,
    DEFAULT_PROJECT_ROLE_KEYS,
    PERMISSION_SPECS,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def seed_permission_catalog(db: AsyncSession) -> None:
    existing = (await db.execute(select(Permission.key))).scalars().all()
    existing_set = set(existing)
    for spec in PERMISSION_SPECS:
        if spec.key in existing_set:
            continue
        db.add(
            Permission(
                key=spec.key,
                resource=spec.resource,
                action=spec.action,
                description=spec.description,
            )
        )
    await db.commit()


async def _permission_id_map(db: AsyncSession) -> dict[str, int]:
    rows = (await db.execute(select(Permission))).scalars().all()
    return {row.key: row.id for row in rows}


async def ensure_default_roles_for_organization(db: AsyncSession, organization_id: int) -> None:
    await seed_permission_catalog(db)
    permission_ids = await _permission_id_map(db)

    org_roles = (
        await db.execute(
            select(OrganizationRole).where(OrganizationRole.organization_id == organization_id)
        )
    ).scalars().all()
    org_role_by_slug = {role.slug: role for role in org_roles}

    for slug, name in {
        "org_admin": "Organization Admin",
        "org_user": "Organization User",
    }.items():
        if slug not in org_role_by_slug:
            role = OrganizationRole(
                organization_id=organization_id,
                name=name,
                slug=slug,
                is_builtin=True,
            )
            db.add(role)
            await db.flush()
            org_role_by_slug[slug] = role

    project_roles = (
        await db.execute(
            select(ProjectRole).where(ProjectRole.organization_id == organization_id)
        )
    ).scalars().all()
    project_role_by_slug = {role.slug: role for role in project_roles}
    for slug, name in {
        "project_admin": "Project Admin",
        "project_user": "Project User",
    }.items():
        if slug not in project_role_by_slug:
            role = ProjectRole(
                organization_id=organization_id,
                name=name,
                slug=slug,
                is_builtin=True,
            )
            db.add(role)
            await db.flush()
            project_role_by_slug[slug] = role

    for slug, keys in DEFAULT_ORG_ROLE_KEYS.items():
        role = org_role_by_slug.get(slug)
        if not role:
            continue
        await db.execute(
            delete(OrganizationRolePermission).where(OrganizationRolePermission.role_id == role.id)
        )
        for key in keys:
            pid = permission_ids.get(key)
            if not pid:
                continue
            db.add(
                OrganizationRolePermission(
                    role_id=role.id,
                    permission_id=pid,
                    effect=EFFECT_ALLOW,
                )
            )

    for slug, keys in DEFAULT_PROJECT_ROLE_KEYS.items():
        role = project_role_by_slug.get(slug)
        if not role:
            continue
        await db.execute(delete(ProjectRolePermission).where(ProjectRolePermission.role_id == role.id))
        for key in keys:
            pid = permission_ids.get(key)
            if not pid:
                continue
            db.add(
                ProjectRolePermission(
                    role_id=role.id,
                    permission_id=pid,
                    effect=EFFECT_ALLOW,
                )
            )

    await db.commit()


async def get_role_by_slug(
    db: AsyncSession,
    *,
    organization_id: int,
    role_type: str,
    slug: str,
) -> OrganizationRole | ProjectRole | None:
    if role_type == "organization":
        stmt = select(OrganizationRole).where(
            OrganizationRole.organization_id == organization_id,
            OrganizationRole.slug == slug,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    stmt = select(ProjectRole).where(
        ProjectRole.organization_id == organization_id,
        ProjectRole.slug == slug,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_role_by_id(
    db: AsyncSession,
    *,
    organization_id: int,
    role_type: str,
    role_id: int,
) -> OrganizationRole | ProjectRole | None:
    if role_type == "organization":
        stmt = select(OrganizationRole).where(
            OrganizationRole.id == role_id,
            OrganizationRole.organization_id == organization_id,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    stmt = select(ProjectRole).where(
        ProjectRole.id == role_id,
        ProjectRole.organization_id == organization_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def has_permission(
    db: AsyncSession,
    ctx: WorkspaceContext,
    permission_key: str,
    *,
    resource_type: str | None = None,
    resource_id: int | None = None,
) -> bool:
    if ctx.is_org_admin:
        return True

    permission = (
        await db.execute(select(Permission).where(Permission.key == permission_key))
    ).scalar_one_or_none()
    if not permission:
        return False

    effects: list[str] = []

    if ctx.organization_membership.role_id:
        rows = (
            await db.execute(
                select(OrganizationRolePermission.effect).where(
                    OrganizationRolePermission.role_id == ctx.organization_membership.role_id,
                    OrganizationRolePermission.permission_id == permission.id,
                )
            )
        ).scalars().all()
        effects.extend(rows)

    if ctx.project_membership and ctx.project_membership.role_id:
        rows = (
            await db.execute(
                select(ProjectRolePermission.effect).where(
                    ProjectRolePermission.role_id == ctx.project_membership.role_id,
                    ProjectRolePermission.permission_id == permission.id,
                )
            )
        ).scalars().all()
        effects.extend(rows)

    user_grant_filters = [
        UserPermissionGrant.organization_id == ctx.organization_id,
        UserPermissionGrant.user_id == ctx.user.id,
        UserPermissionGrant.permission_id == permission.id,
        or_(UserPermissionGrant.expires_at.is_(None), UserPermissionGrant.expires_at > _utcnow()),
        or_(UserPermissionGrant.project_id.is_(None), UserPermissionGrant.project_id == ctx.project_id),
    ]

    if resource_type is None:
        user_grant_filters.append(UserPermissionGrant.resource_type.is_(None))
        user_grant_filters.append(UserPermissionGrant.resource_id.is_(None))
    else:
        user_grant_filters.append(
            or_(
                and_(
                    UserPermissionGrant.resource_type == resource_type,
                    UserPermissionGrant.resource_id == resource_id,
                ),
                and_(
                    UserPermissionGrant.resource_type.is_(None),
                    UserPermissionGrant.resource_id.is_(None),
                ),
            )
        )

    rows = (
        await db.execute(select(UserPermissionGrant.effect).where(*user_grant_filters))
    ).scalars().all()
    effects.extend(rows)

    if EFFECT_DENY in effects:
        return False
    return EFFECT_ALLOW in effects


async def require_permission(
    db: AsyncSession,
    ctx: WorkspaceContext,
    permission_key: str,
    *,
    resource_type: str | None = None,
    resource_id: int | None = None,
) -> None:
    allowed = await has_permission(
        db,
        ctx,
        permission_key,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    if not allowed:
        raise HTTPException(403, f"Missing permission: {permission_key}")


async def can_access_project_resource(
    db: AsyncSession,
    ctx: WorkspaceContext,
    *,
    permission_key: str,
    resource_type: str,
    resource_id: int,
    resource_project_id: int,
    visibility_scope: str | None,
) -> bool:
    if resource_project_id == ctx.project_id:
        return await has_permission(
            db,
            ctx,
            permission_key,
            resource_type=resource_type,
            resource_id=resource_id,
        )

    if visibility_scope == VISIBILITY_ORGANIZATION:
        return await has_permission(
            db,
            ctx,
            permission_key,
            resource_type=resource_type,
            resource_id=resource_id,
        )

    return await has_permission(
        db,
        ctx,
        permission_key,
        resource_type=resource_type,
        resource_id=resource_id,
    )
