from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization_membership import OrganizationMembership
from models.project import Project
from models.project_membership import ProjectMembership
from models.user import User
from schemas.schemas import (
    ProjectCreate,
    ProjectMembershipCreate,
    ProjectMembershipOut,
    ProjectOut,
    ProjectUpdate,
)
from services.context import WorkspaceContext, require_org_context
from services.permissions import get_role_by_slug, require_permission
from services.workspaces import create_project_for_org

router = APIRouter()


def _project_membership_out(row: ProjectMembership, user: User | None = None) -> ProjectMembershipOut:
    return ProjectMembershipOut(
        id=row.id,
        organization_id=row.organization_id,
        project_id=row.project_id,
        user_id=row.user_id,
        user_full_name=user.full_name if user else None,
        user_email=user.email if user else None,
        role_id=row.role_id,
        is_active=row.is_active,
        created_at=row.created_at,
    )


async def _resolve_project_context(
    db: AsyncSession,
    org_ctx: WorkspaceContext,
    project_id: int,
) -> tuple[Project, WorkspaceContext]:
    project = await db.get(Project, project_id)
    if not project or project.organization_id != org_ctx.organization_id:
        raise HTTPException(404, "Project not found")

    membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.organization_id == org_ctx.organization_id,
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == org_ctx.user.id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not membership and not org_ctx.is_org_admin:
        raise HTTPException(403, "You are not a member of this project")

    return project, WorkspaceContext(
        user=org_ctx.user,
        organization_id=org_ctx.organization_id,
        project_id=project_id,
        organization_membership=org_ctx.organization_membership,
        project_membership=membership,
        is_org_admin=org_ctx.is_org_admin,
    )


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    include_archived: bool = False,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "projects.read")

    stmt = select(Project).where(Project.organization_id == ctx.organization_id)
    if not ctx.is_org_admin:
        stmt = stmt.join(
            ProjectMembership,
            ProjectMembership.project_id == Project.id,
        ).where(
            ProjectMembership.organization_id == ctx.organization_id,
            ProjectMembership.user_id == ctx.user.id,
            ProjectMembership.is_active.is_(True),
        )

    if not include_archived:
        stmt = stmt.where(Project.is_archived.is_(False))

    rows = (await db.execute(stmt.distinct().order_by(Project.created_at.desc()))).scalars().all()
    return [ProjectOut.model_validate(r) for r in rows]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(db, ctx, "projects.write")
    project = await create_project_for_org(
        db,
        organization_id=ctx.organization_id,
        name=body.name,
        description=body.description,
        created_by_user_id=ctx.user.id,
        add_creator_as_admin=True,
    )
    return ProjectOut.model_validate(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    project, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.read")
    return ProjectOut.model_validate(project)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    project, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.write")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    project, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.delete")
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/members", response_model=list[ProjectMembershipOut])
async def list_project_members(
    project_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    _, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.manage_members")

    stmt = (
        select(ProjectMembership, User)
        .join(User, User.id == ProjectMembership.user_id)
        .where(
            ProjectMembership.organization_id == ctx.organization_id,
            ProjectMembership.project_id == project_id,
            ProjectMembership.is_active.is_(True),
        )
        .order_by(User.full_name.asc(), User.email.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [_project_membership_out(membership, user) for membership, user in rows]


@router.post("/{project_id}/members", response_model=ProjectMembershipOut, status_code=201)
async def add_project_member(
    project_id: int,
    body: ProjectMembershipCreate,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    _, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.manage_members")

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
        raise HTTPException(400, "User must be an active organization member before joining a project")

    existing_project_membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.organization_id == ctx.organization_id,
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == body.user_id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if existing_project_membership:
        raise HTTPException(409, "User is already a member of this project")

    role_id = body.role_id
    if role_id is None:
        default_role = await get_role_by_slug(
            db,
            organization_id=ctx.organization_id,
            role_type="project",
            slug="project_user",
        )
        role_id = default_role.id if default_role else None

    membership = ProjectMembership(
        organization_id=ctx.organization_id,
        project_id=project_id,
        user_id=body.user_id,
        role_id=role_id,
        is_active=True,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return _project_membership_out(membership, user)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_project_member(
    project_id: int,
    user_id: int,
    ctx: WorkspaceContext = Depends(require_org_context),
    db: AsyncSession = Depends(get_db),
):
    _, project_ctx = await _resolve_project_context(db, ctx, project_id)
    await require_permission(db, project_ctx, "projects.manage_members")

    membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.organization_id == ctx.organization_id,
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == user_id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Project membership not found")
    await db.delete(membership)
    await db.commit()
