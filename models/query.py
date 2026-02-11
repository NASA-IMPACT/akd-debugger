from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    suite_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmark_suites.id", ondelete="CASCADE"), nullable=False
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[str] = mapped_column(Text, nullable=False)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    suite: Mapped["BenchmarkSuite"] = relationship(
        "BenchmarkSuite", back_populates="queries"
    )
    results: Mapped[list["Result"]] = relationship("Result", back_populates="query")
    trace_logs: Mapped[list["TraceLog"]] = relationship(
        "TraceLog", back_populates="query"
    )
