from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from models.enums import VISIBILITY_PROJECT


class RunCostPreview(Base):
    __tablename__ = "run_cost_previews"

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
    suite_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmark_suites.id"), nullable=False, index=True
    )
    agent_config_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent_configs.id"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), server_default="{}", nullable=False
    )
    batch_size: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="10"
    )
    repeat: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    output_dir: Mapped[str | None] = mapped_column(Text, nullable=True)
    query_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    sample_query_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    total_query_count: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_usage: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sample_cost_usd: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_total_cost_usd: Mapped[float] = mapped_column(Float, nullable=False)
    pricing_version: Mapped[str] = mapped_column(String(64), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(8), nullable=False, server_default="USD"
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
