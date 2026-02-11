from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    suite_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmark_suites.id"), nullable=False
    )
    agent_config_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent_configs.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    run_group: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    run_number: Mapped[int] = mapped_column(Integer, server_default="1")
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="pending"
    )
    progress_current: Mapped[int] = mapped_column(Integer, server_default="0")
    progress_total: Mapped[int] = mapped_column(Integer, server_default="0")
    batch_size: Mapped[int] = mapped_column(Integer, server_default="10")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_dir: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default="{}", nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    suite: Mapped["BenchmarkSuite"] = relationship(
        "BenchmarkSuite", back_populates="runs"
    )
    agent_config: Mapped["AgentConfig"] = relationship(
        "AgentConfig", back_populates="runs"
    )
    results: Mapped[list["Result"]] = relationship(
        "Result", back_populates="run", cascade="all, delete-orphan"
    )
    trace_logs: Mapped[list["TraceLog"]] = relationship(
        "TraceLog", back_populates="run", cascade="all, delete-orphan"
    )
    comparisons: Mapped[list["Comparison"]] = relationship(
        "Comparison", secondary="comparison_runs", back_populates="runs"
    )
