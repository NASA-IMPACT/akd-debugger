from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class TraceLog(Base):
    __tablename__ = "trace_logs"

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
    run_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    query_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("queries.id"), nullable=True, index=True
    )
    agent_config_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("agent_configs.id"), nullable=True, index=True
    )
    conversation_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True, index=True
    )
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="openai"
    )
    endpoint: Mapped[str] = mapped_column(
        String(120), nullable=False, server_default="agents.runner.run"
    )
    model: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="started", index=True
    )
    trace_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="benchmark", index=True
    )
    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    run: Mapped["Run | None"] = relationship("Run", back_populates="trace_logs")
    query: Mapped["Query | None"] = relationship("Query", back_populates="trace_logs")
    agent_config: Mapped["AgentConfig | None"] = relationship(
        "AgentConfig", back_populates="trace_logs"
    )
    result: Mapped["Result | None"] = relationship(
        "Result", back_populates="trace_log", uselist=False
    )
