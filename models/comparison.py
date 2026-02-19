from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.enums import VISIBILITY_PROJECT

comparison_runs = Table(
    "comparison_runs",
    Base.metadata,
    Column(
        "comparison_id",
        Integer,
        ForeignKey("comparisons.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "run_id", Integer, ForeignKey("runs.id", ondelete="CASCADE"), primary_key=True
    ),
)


class Comparison(Base):
    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    visibility_scope: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=VISIBILITY_PROJECT, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suite_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmark_suites.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    suite: Mapped["BenchmarkSuite"] = relationship("BenchmarkSuite")
    runs: Mapped[list["Run"]] = relationship(
        "Run", secondary=comparison_runs, back_populates="comparisons"
    )
