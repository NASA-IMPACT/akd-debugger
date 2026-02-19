from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.organization import Organization
from models.organization_membership import OrganizationMembership
from models.project import Project
from models.project_membership import ProjectMembership
from services.permissions import ensure_default_roles_for_organization, get_role_by_slug
from services.security import slugify


async def generate_unique_org_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)
    slug = base
    counter = 2
    while True:
        stmt = select(Organization.id).where(Organization.slug == slug)
        exists = (await db.execute(stmt)).scalar_one_or_none()
        if not exists:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def create_organization_with_defaults(
    db: AsyncSession,
    *,
    name: str,
    owner_user_id: int | None,
    is_personal: bool = False,
    is_bootstrap: bool = False,
) -> Organization:
    org = Organization(
        name=name,
        slug=await generate_unique_org_slug(db, name),
        is_personal=is_personal,
        is_bootstrap=is_bootstrap,
        owner_user_id=owner_user_id,
    )
    db.add(org)
    await db.flush()
    await ensure_default_roles_for_organization(db, org.id)

    if owner_user_id is not None:
        org_admin_role = await get_role_by_slug(
            db,
            organization_id=org.id,
            role_type="organization",
            slug="org_admin",
        )
        db.add(
            OrganizationMembership(
                organization_id=org.id,
                user_id=owner_user_id,
                role_id=org_admin_role.id if org_admin_role else None,
                is_active=True,
            )
        )

    await db.commit()
    await db.refresh(org)
    return org


async def create_project_for_org(
    db: AsyncSession,
    *,
    organization_id: int,
    name: str,
    description: str | None,
    created_by_user_id: int | None,
    add_creator_as_admin: bool = True,
) -> Project:
    project = Project(
        organization_id=organization_id,
        name=name,
        description=description,
        created_by_user_id=created_by_user_id,
        is_archived=False,
    )
    db.add(project)
    await db.flush()

    if add_creator_as_admin and created_by_user_id is not None:
        role = await get_role_by_slug(
            db,
            organization_id=organization_id,
            role_type="project",
            slug="project_admin",
        )
        db.add(
            ProjectMembership(
                organization_id=organization_id,
                project_id=project.id,
                user_id=created_by_user_id,
                role_id=role.id if role else None,
                is_active=True,
            )
        )

    await db.commit()
    await db.refresh(project)
    return project
