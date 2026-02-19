"""Shared database utility functions."""

from typing import Type, TypeVar
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from services.context import get_request_context

T = TypeVar("T")


async def get_or_404(
    db: AsyncSession,
    model: Type[T],
    id: int,
    name: str | None = None,
    enforce_workspace_scope: bool = True,
) -> T:
    """Fetch a model instance by ID or raise 404 if not found.
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        id: Primary key ID to fetch
        name: Optional custom name for error message. If None, uses the model's 
              class name (e.g., "AgentConfig" becomes "AgentConfig not found").
        
    Returns:
        Model instance
        
    Raises:
        HTTPException: 404 if not found, with message "{name} not found"
    """
    obj = await db.get(model, id)
    if not obj:
        entity_name = name or model.__name__
        raise HTTPException(404, f"{entity_name} not found")
    if enforce_workspace_scope:
        ctx = get_request_context()
        if hasattr(obj, "organization_id") and getattr(obj, "organization_id") != ctx.organization_id:
            entity_name = name or model.__name__
            raise HTTPException(404, f"{entity_name} not found")
        if hasattr(obj, "project_id") and ctx.project_id is not None:
            obj_project_id = getattr(obj, "project_id")
            visibility = getattr(obj, "visibility_scope", None)
            if obj_project_id != ctx.project_id and visibility != "organization":
                entity_name = name or model.__name__
                raise HTTPException(404, f"{entity_name} not found")
    return obj
