from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Result(Base):
    __tablename__ = "results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    query_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("queries.id"), nullable=False
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
    trace_log: Mapped["TraceLog | None"] = relationship(
        "TraceLog", back_populates="result"
    )
    grade: Mapped["Grade | None"] = relationship(
        "Grade", back_populates="result", uselist=False, cascade="all, delete-orphan"
    )
