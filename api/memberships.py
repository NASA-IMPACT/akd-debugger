from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.organization_membership import OrganizationMembership
from models.project_membership import ProjectMembership
from models.user import User
from schemas.schemas import MembershipOut, ProjectMembershipOut
from services.context import get_current_user

router = APIRouter()


@router.get("/me")
async def my_memberships(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_rows = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
        )
    ).scalars().all()
    project_rows = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.user_id == user.id,
                ProjectMembership.is_active.is_(True),
            )
        )
    ).scalars().all()

    return {
        "organizations": [MembershipOut.model_validate(r) for r in org_rows],
        "projects": [ProjectMembershipOut.model_validate(r) for r in project_rows],
    }
