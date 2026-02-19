from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.app_notification import AppNotification
from schemas.schemas import AppNotificationOut
from services.context import get_request_context
from services.permissions import require_permission

router = APIRouter()


@router.get("", response_model=list[AppNotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
):
    ctx = get_request_context()
    await require_permission(db, ctx, "notifications.read")
    q = min(max(limit, 1), 200)
    stmt = select(AppNotification).where(AppNotification.organization_id == ctx.organization_id)
    if unread_only:
        stmt = stmt.where(AppNotification.is_read.is_(False))
    stmt = stmt.order_by(AppNotification.created_at.desc()).limit(q)
    rows = (await db.execute(stmt)).scalars().all()
    return [AppNotificationOut.model_validate(r) for r in rows]


@router.post("/{notification_id}/read", response_model=AppNotificationOut)
async def mark_notification_read(notification_id: int, db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "notifications.manage")
    notif = await db.get(AppNotification, notification_id)
    if not notif or notif.organization_id != ctx.organization_id:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    await db.commit()
    await db.refresh(notif)
    return AppNotificationOut.model_validate(notif)


@router.post("/read-all")
async def mark_all_notifications_read(db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "notifications.manage")
    stmt = (
        update(AppNotification)
        .where(
            AppNotification.organization_id == ctx.organization_id,
            AppNotification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"updated": int(result.rowcount or 0)}


@router.delete("")
async def delete_all_notifications(db: AsyncSession = Depends(get_db)):
    ctx = get_request_context()
    await require_permission(db, ctx, "notifications.manage")
    count_stmt = select(AppNotification.id).where(AppNotification.organization_id == ctx.organization_id)
    deleted = len((await db.execute(count_stmt)).scalars().all())
    if deleted == 0:
        return {"deleted": 0}
    await db.execute(delete(AppNotification).where(AppNotification.organization_id == ctx.organization_id))
    await db.commit()
    return {"deleted": deleted}
