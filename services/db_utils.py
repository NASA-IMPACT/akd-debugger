"""Shared database utility functions."""

from typing import Type, TypeVar
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def get_or_404(
    db: AsyncSession,
    model: Type[T],
    id: int,
    name: str | None = None,
) -> T:
    """Fetch a model instance by ID or raise 404 if not found.
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        id: Primary key ID to fetch
        name: Optional custom name for error message (defaults to model name)
        
    Returns:
        Model instance
        
    Raises:
        HTTPException: 404 if not found
    """
    obj = await db.get(model, id)
    if not obj:
        entity_name = name or model.__name__
        raise HTTPException(404, f"{entity_name} not found")
    return obj
