"""管理后台 API：套餐开关、用户管理、统计"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import (
    SessionLocal, User, SubscriptionPlan, UserSubscription,
    UsageRecord, PaymentRecord, SystemSetting
)
from auth import get_current_user, require_admin, get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── 套餐管理 ────────────────────────────────────────────

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    search_limit_monthly: Optional[int] = None
    include_ai_description: Optional[bool] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


@router.get("/plans")
def list_plans(admin=Depends(require_admin), db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all()
    return [
        {
            "id": p.id, "slug": p.slug, "name": p.name,
            "description": p.description,
            "price_monthly": p.price_monthly, "price_yearly": p.price_yearly,
            "search_limit_monthly": p.search_limit_monthly,
            "include_ai_description": p.include_ai_description,
            "enabled": p.enabled, "sort_order": p.sort_order,
            "subscriber_count": db.query(UserSubscription).filter_by(plan_id=p.id, status="active").count(),
        }
        for p in plans
    ]


@router.patch("/plans/{plan_id}")
def update_plan(plan_id: str, data: PlanUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    plan = db.query(SubscriptionPlan).filter_by(id=plan_id).first()
    if not plan:
        raise HTTPException(404, "套餐不存在")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(plan, field, value)
    db.commit()

    return {"ok": True, "plan": {
        "id": plan.id, "slug": plan.slug, "name": plan.name, "enabled": plan.enabled
    }}


# ─── 系统设置 ────────────────────────────────────────────

@router.get("/settings")
def get_settings(admin=Depends(require_admin), db: Session = Depends(get_db)):
    settings = db.query(SystemSetting).all()
    return {s.key: s.value for s in settings}


class SettingUpdate(BaseModel):
    key: str
    value: str


@router.post("/settings")
def update_setting(data: SettingUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    setting = db.query(SystemSetting).filter_by(key=data.key).first()
    if setting:
        setting.value = data.value
    else:
        db.add(SystemSetting(key=data.key, value=data.value))
    db.commit()
    return {"ok": True}


# ─── 统计 ────────────────────────────────────────────────

@router.get("/stats")
def get_stats(admin=Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar()
    active_subs = db.query(func.count(UserSubscription.id)).filter_by(status="active").scalar()
    total_searches = db.query(func.count(UsageRecord.id)).filter_by(action="search").scalar()
    total_payments = db.query(func.count(PaymentRecord.id)).filter_by(status="completed").scalar()
    total_revenue = db.query(func.coalesce(func.sum(PaymentRecord.amount), 0)).filter_by(status="completed").scalar()

    # 用的最多的套餐
    plan_counts = db.query(
        SubscriptionPlan.name, func.count(UserSubscription.id)
    ).join(SubscriptionPlan, UserSubscription.plan_id == SubscriptionPlan.id
    ).filter(UserSubscription.status == "active"
    ).group_by(SubscriptionPlan.name).all()

    return {
        "total_users": total_users,
        "active_subscriptions": active_subs,
        "total_searches": total_searches,
        "total_payments": total_payments,
        "total_revenue": round(total_revenue, 2),
        "plan_distribution": {name: count for name, count in plan_counts},
    }


# ─── 用户管理 ────────────────────────────────────────────

@router.get("/users")
def list_users(admin=Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).limit(100).all()
    return [
        {
            "id": u.id, "email": u.email, "name": u.name,
            "role": u.role, "created_at": u.created_at.isoformat(),
            "subscription": u.subscription.plan.name if u.subscription and u.subscription.plan else "none",
        }
        for u in users
    ]
