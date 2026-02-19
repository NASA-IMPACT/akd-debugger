from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    is_personal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", index=True)
    is_bootstrap: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", index=True)
    owner_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner_user: Mapped["User | None"] = relationship("User", back_populates="owned_organizations")
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        "OrganizationMembership", back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="organization", cascade="all, delete-orphan"
    )
    organization_roles: Mapped[list["OrganizationRole"]] = relationship(
        "OrganizationRole", back_populates="organization", cascade="all, delete-orphan"
    )
    project_roles: Mapped[list["ProjectRole"]] = relationship(
        "ProjectRole", back_populates="organization", cascade="all, delete-orphan"
    )
