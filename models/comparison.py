from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

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
