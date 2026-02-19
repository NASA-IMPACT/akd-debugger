from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.enums import EFFECT_ALLOW


class ProjectRolePermission(Base):
    __tablename__ = "project_role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_project_role_permission"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("project_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    effect: Mapped[str] = mapped_column(String(10), nullable=False, server_default=EFFECT_ALLOW, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role: Mapped["ProjectRole"] = relationship("ProjectRole", back_populates="permissions")
    permission: Mapped["Permission"] = relationship("Permission")
