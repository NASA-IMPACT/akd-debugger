from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization_membership import OrganizationMembership
from models.organization_role import OrganizationRole
from models.project import Project
from models.project_membership import ProjectMembership
from models.project_role import ProjectRole
from models.user import User
from models.user_permission_grant import UserPermissionGrant
from services.auth import require_user


@dataclass
class WorkspaceContext:
    user: User
    organization_id: int
    project_id: int | None
    organization_membership: OrganizationMembership
    project_membership: ProjectMembership | None
    is_org_admin: bool


_request_context: ContextVar[WorkspaceContext | None] = ContextVar(
    "request_workspace_context", default=None
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_request_context() -> WorkspaceContext:
    ctx = _request_context.get()
    if not ctx:
        raise HTTPException(500, "Request context not available")
    return ctx


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    return await require_user(request, db)


def _parse_positive_int(header_name: str, raw: str | None) -> int:
    if raw is None:
        raise HTTPException(400, f"{header_name} header is required")
    raw = raw.strip()
    if not raw.isdigit() or int(raw) <= 0:
        raise HTTPException(400, f"{header_name} must be a positive integer")
    return int(raw)


def _request_arg(
    request: Request,
    *,
    keys: tuple[str, ...],
) -> str | None:
    for key in keys:
        raw = request.query_params.get(key)
        if raw is None:
            continue
        raw = raw.strip()
        if raw:
            return raw
    return None


def _allow_workspace_default(request: Request) -> bool:
    return request.method.upper() in {"GET", "HEAD", "OPTIONS"}


async def _resolve_default_org_id(
    db: AsyncSession,
    user_id: int,
) -> int | None:
    stmt = (
        select(OrganizationMembership.organization_id)
        .where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.is_active.is_(True),
        )
        .order_by(OrganizationMembership.organization_id.asc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_default_project_id(
    db: AsyncSession,
    *,
    organization_id: int,
    user_id: int,
    is_org_admin: bool,
) -> int | None:
    member_stmt = (
        select(ProjectMembership.project_id)
        .where(
            ProjectMembership.organization_id == organization_id,
            ProjectMembership.user_id == user_id,
            ProjectMembership.is_active.is_(True),
        )
        .order_by(ProjectMembership.project_id.asc())
        .limit(1)
    )
    member_project_id = (await db.execute(member_stmt)).scalar_one_or_none()
    if member_project_id is not None:
        return member_project_id

    if not is_org_admin:
        return None

    org_project_stmt = (
        select(Project.id)
        .where(Project.organization_id == organization_id)
        .order_by(Project.id.asc())
        .limit(1)
    )
    return (await db.execute(org_project_stmt)).scalar_one_or_none()


async def require_org_context(
    request: Request,
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_org_id = x_org_id or _request_arg(
        request,
        keys=("org_id", "organization_id"),
    )
    if raw_org_id is None and _allow_workspace_default(request):
        default_org_id = await _resolve_default_org_id(db, user.id)
        if default_org_id is not None:
            raw_org_id = str(default_org_id)

    org_id = _parse_positive_int("X-Org-Id", raw_org_id)
    stmt = select(OrganizationMembership).where(
        OrganizationMembership.organization_id == org_id,
        OrganizationMembership.user_id == user.id,
        OrganizationMembership.is_active.is_(True),
    )
    org_membership = (await db.execute(stmt)).scalar_one_or_none()
    if not org_membership:
        raise HTTPException(403, "You are not a member of this organization")

    is_org_admin = False
    if org_membership.role_id is None:
        default_org_role = (
            await db.execute(
                select(OrganizationRole).where(
                    OrganizationRole.organization_id == org_id,
                    OrganizationRole.slug == "org_user",
                )
            )
        ).scalar_one_or_none()
        if default_org_role:
            org_membership.role_id = default_org_role.id
            await db.commit()
            await db.refresh(org_membership)
    if org_membership.role_id is not None:
        role = await db.get(OrganizationRole, org_membership.role_id)
        if role and role.slug == "org_admin":
            is_org_admin = True

    ctx = WorkspaceContext(
        user=user,
        organization_id=org_id,
        project_id=None,
        organization_membership=org_membership,
        project_membership=None,
        is_org_admin=is_org_admin,
    )
    token = _request_context.set(ctx)
    request.state.workspace = ctx
    try:
        yield ctx
    finally:
        _request_context.reset(token)


async def require_project_context(
    request: Request,
    x_project_id: str | None = Header(default=None, alias="X-Project-Id"),
    org_ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    raw_project_id = x_project_id or _request_arg(
        request,
        keys=("project_id",),
    )
    if raw_project_id is None and _allow_workspace_default(request):
        default_project_id = await _resolve_default_project_id(
            db,
            organization_id=org_ctx.organization_id,
            user_id=org_ctx.user.id,
            is_org_admin=org_ctx.is_org_admin,
        )
        if default_project_id is not None:
            raw_project_id = str(default_project_id)

    project_id = _parse_positive_int("X-Project-Id", raw_project_id)

    project = await db.get(Project, project_id)
    if not project or project.organization_id != org_ctx.organization_id:
        raise HTTPException(404, "Project not found in organization")

    stmt = select(ProjectMembership).where(
        ProjectMembership.organization_id == org_ctx.organization_id,
        ProjectMembership.project_id == project_id,
        ProjectMembership.user_id == org_ctx.user.id,
        ProjectMembership.is_active.is_(True),
    )
    project_membership = (await db.execute(stmt)).scalar_one_or_none()
    if project_membership and project_membership.role_id is None:
        default_project_role = (
            await db.execute(
                select(ProjectRole).where(
                    ProjectRole.organization_id == org_ctx.organization_id,
                    ProjectRole.slug == "project_user",
                )
            )
        ).scalar_one_or_none()
        if default_project_role:
            project_membership.role_id = default_project_role.id
            await db.commit()
            await db.refresh(project_membership)

    if not project_membership and not org_ctx.is_org_admin:
        grant_stmt = select(UserPermissionGrant.id).where(
            UserPermissionGrant.organization_id == org_ctx.organization_id,
            UserPermissionGrant.user_id == org_ctx.user.id,
            or_(UserPermissionGrant.project_id.is_(None), UserPermissionGrant.project_id == project_id),
            or_(UserPermissionGrant.expires_at.is_(None), UserPermissionGrant.expires_at > _utcnow()),
        )
        has_any_grant = (await db.execute(grant_stmt.limit(1))).scalar_one_or_none() is not None
        if not has_any_grant:
            raise HTTPException(403, "You are not a member of this project")

    ctx = WorkspaceContext(
        user=org_ctx.user,
        organization_id=org_ctx.organization_id,
        project_id=project_id,
        organization_membership=org_ctx.organization_membership,
        project_membership=project_membership,
        is_org_admin=org_ctx.is_org_admin,
    )
    token = _request_context.set(ctx)
    request.state.workspace = ctx
    try:
        yield ctx
    finally:
        _request_context.reset(token)
