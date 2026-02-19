from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.enums import VISIBILITY_PROJECT


class Result(Base):
    __tablename__ = "results"

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
    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    query_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("queries.id"), nullable=False
    )
    parent_result_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("results.id", ondelete="CASCADE"), nullable=True, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    is_default_version: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False, server_default="true", index=True
    )
    version_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False, server_default="active", index=True
    )
    trace_log_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("trace_logs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    agent_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_calls: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reasoning: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    execution_time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped["Run"] = relationship("Run", back_populates="results")
    query: Mapped["Query"] = relationship("Query", back_populates="results")
    parent: Mapped["Result | None"] = relationship(
        "Result",
        remote_side=[id],
        back_populates="versions",
    )
    versions: Mapped[list["Result"]] = relationship(
        "Result",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    trace_log: Mapped["TraceLog | None"] = relationship(
        "TraceLog", back_populates="result"
    )
    grade: Mapped["Grade | None"] = relationship(
        "Grade", back_populates="result", uselist=False, cascade="all, delete-orphan"
    )
